package httpapi

import (
	"bufio"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/api"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/archive"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/audit"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/authz"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/commands"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/enginetoken"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/fsx"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/jobs"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/transfer"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/trash"
)

const jobID = "0b6c4a9e-6f0e-4d7c-9a51-2f9b8f7c1d10"

type dirFiles struct {
	isDir bool
	err   error
}

func (f dirFiles) Stat(string) (fsx.Entry, error)                   { return fsx.Entry{IsDir: f.isDir}, f.err }
func (f dirFiles) ReadDir(string) ([]fsx.Entry, error)              { return nil, f.err }
func (f dirFiles) Walk(string, func(string, fsx.Entry) error) error { return f.err }

type fakeJobs struct {
	job                                          jobs.Job
	startErr, getErr, listErr, cancelErr, logErr error
	// getErrAfter fails Get from its second call (the reload after a change).
	getErrAfter bool
	gets        int
	owners      []string
	notices     chan jobs.Notice
	transfer    transfer.Args
	compress    archive.CompressArgs
	command     commands.RunArgs
}

func (f *fakeJobs) StartFolderSize(context.Context, string, authz.Subject) (string, error) {
	return jobID, f.startErr
}

func (f *fakeJobs) StartTransfer(_ context.Context, args transfer.Args) (string, error) {
	f.transfer = args
	return jobID, f.startErr
}

func (f *fakeJobs) StartDelete(context.Context, trash.DeleteArgs) (string, error) {
	return jobID, f.startErr
}

func (f *fakeJobs) StartEmptyTrash(context.Context, trash.EmptyArgs) (string, error) {
	return jobID, f.startErr
}

func (f *fakeJobs) StartCompress(_ context.Context, args archive.CompressArgs) (string, error) {
	f.compress = args
	return jobID, f.startErr
}

func (f *fakeJobs) StartExtract(context.Context, archive.ExtractArgs) (string, error) {
	return jobID, f.startErr
}

func (f *fakeJobs) StartChecksum(context.Context, archive.ChecksumArgs) (string, error) {
	return jobID, f.startErr
}

func (f *fakeJobs) StartCommand(_ context.Context, args commands.RunArgs) (string, error) {
	f.command = args
	return jobID, f.startErr
}

func (f *fakeJobs) Get(_ context.Context, _ string, owner string) (jobs.Job, error) {
	f.gets++
	f.owners = append(f.owners, owner)
	if f.getErrAfter && f.gets > 1 {
		return jobs.Job{}, errors.New("db")
	}
	return f.job, f.getErr
}

func (f *fakeJobs) List(_ context.Context, owner string, _ int) ([]jobs.Job, error) {
	f.owners = append(f.owners, owner)
	return []jobs.Job{f.job}, f.listErr
}

func (f *fakeJobs) Cancel(context.Context, jobs.Job) error { return f.cancelErr }

func (f *fakeJobs) Logs(context.Context, string, int) ([]jobs.LogLine, error) {
	return []jobs.LogLine{{Seq: 1, Level: "info", Line: "hello"}}, f.logErr
}

func (f *fakeJobs) Subscribe(string) (<-chan jobs.Notice, func()) {
	return f.notices, func() {}
}

type fakeAudit struct {
	mu     sync.Mutex
	events []audit.Event
	err    error
}

func (f *fakeAudit) Record(_ context.Context, event audit.Event) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.events = append(f.events, event)
	return f.err
}

func sampleJob() jobs.Job {
	target := "/docs"
	eta := int32(4)
	started := time.Unix(10, 0).In(time.FixedZone("CET", 3600))
	return jobs.Job{
		ID: jobID, Kind: "folder_size", OwnerID: "bob", State: jobs.StateRunning, Target: &target,
		Snapshot:  jobs.Snapshot{Progress: jobs.Progress{BytesDone: 10, CurrentPath: "/docs/a"}, EtaSeconds: &eta},
		Result:    map[string]any{"bytes": 10},
		CreatedAt: time.Unix(0, 0).In(time.FixedZone("CET", 3600)),
		StartedAt: &started,
	}
}

type jobsHarness struct {
	t     *testing.T
	user  string
	admin string
	// userAdvanced is bob holding commands:advanced.
	userAdvanced string
	verify       *enginetoken.Verifier
}

func newJobsHarness(t *testing.T) jobsHarness {
	t.Helper()
	public, private, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	return jobsHarness{
		t: t, verify: enginetoken.NewVerifier(public, time.Now),
		user: signToken(t, private, nil), admin: signToken(t, private, []string{enginetoken.AdminPermission}),
		userAdvanced: signToken(t, private, []string{"commands:advanced"}),
	}
}

func (h jobsHarness) call(deps Deps, method, target, token, body string) (*httptest.ResponseRecorder, api.Error) {
	h.t.Helper()
	deps.Logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	deps.Database = pingOK{}
	deps.Verifier = h.verify
	request := httptest.NewRequest(method, target, strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	if token != "" {
		request.Header.Set("Authorization", "Bearer "+token)
	}
	recorder := httptest.NewRecorder()
	NewRouter(deps).ServeHTTP(recorder, request)
	var failure api.Error
	_ = json.Unmarshal(recorder.Body.Bytes(), &failure)
	return recorder, failure
}

func TestStartFolderSize(t *testing.T) {
	h := newJobsHarness(t)
	readDocs := fakeGrants{grants: []authz.Grant{
		{SubjectType: authz.SubjectUser, SubjectID: "bob", Path: "/docs", Actions: []string{"read"}, Effect: authz.EffectAllow},
	}}
	cases := []struct {
		name   string
		token  string
		body   string
		files  Files
		grants Grants
		jobs   *fakeJobs
		status int
		code   string
	}{
		{"bad path", h.user, `{"path":"docs"}`, dirFiles{isDir: true}, readDocs, &fakeJobs{}, http.StatusBadRequest, fsx.CodeInvalidPath},
		{"grants failure", h.user, `{"path":"/docs"}`, dirFiles{isDir: true}, fakeGrants{err: errors.New("db")}, &fakeJobs{}, http.StatusInternalServerError, codeInternal},
		{"forbidden", h.user, `{"path":"/other"}`, dirFiles{isDir: true}, readDocs, &fakeJobs{}, http.StatusForbidden, codeForbidden},
		{"missing", h.admin, `{"path":"/x"}`, dirFiles{err: fsx.ErrNotFound}, fakeGrants{}, &fakeJobs{}, http.StatusNotFound, fsx.CodeNotFound},
		{"a file", h.admin, `{"path":"/x"}`, dirFiles{}, fakeGrants{}, &fakeJobs{}, http.StatusNotFound, fsx.CodeNotDir},
		{"too many", h.user, `{"path":"/docs"}`, dirFiles{isDir: true}, readDocs, &fakeJobs{startErr: jobs.ErrTooMany}, http.StatusTooManyRequests, jobs.CodeTooMany},
		{"queue failure", h.user, `{"path":"/docs"}`, dirFiles{isDir: true}, readDocs, &fakeJobs{startErr: errors.New("db")}, http.StatusInternalServerError, codeInternal},
		{"reload failure", h.user, `{"path":"/docs"}`, dirFiles{isDir: true}, readDocs, &fakeJobs{getErr: errors.New("db")}, http.StatusInternalServerError, codeInternal},
		{"bad id", h.user, `{"path":"/docs"}`, dirFiles{isDir: true}, readDocs, &fakeJobs{job: jobs.Job{ID: "nope"}}, http.StatusInternalServerError, codeInternal},
		{"queued", h.user, `{"path":"/docs"}`, dirFiles{isDir: true}, readDocs, &fakeJobs{job: sampleJob()}, http.StatusAccepted, ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			auditLog := &fakeAudit{}
			recorder, failure := h.call(Deps{Files: tc.files, Grants: tc.grants, Jobs: tc.jobs, Audit: auditLog},
				http.MethodPost, "/v1/jobs/folder-size", tc.token, tc.body)
			if recorder.Code != tc.status || failure.Code != tc.code {
				t.Fatalf("got %d %q, want %d %q", recorder.Code, failure.Code, tc.status, tc.code)
			}
			if tc.status == http.StatusAccepted && (len(auditLog.events) != 1 || auditLog.events[0].Action != "jobs.start") {
				t.Fatalf("audit %+v", auditLog.events)
			}
		})
	}
}

func TestJobQueries(t *testing.T) {
	h := newJobsHarness(t)
	path := "/v1/jobs/" + jobID
	cases := []struct {
		name   string
		method string
		target string
		token  string
		jobs   *fakeJobs
		audit  *fakeAudit
		status int
		code   string
	}{
		{"list", http.MethodGet, "/v1/jobs?limit=5", h.user, &fakeJobs{job: sampleJob()}, nil, http.StatusOK, ""},
		{"list default", http.MethodGet, "/v1/jobs", h.admin, &fakeJobs{job: sampleJob()}, nil, http.StatusOK, ""},
		{"list failure", http.MethodGet, "/v1/jobs", h.user, &fakeJobs{listErr: errors.New("db")}, nil, http.StatusInternalServerError, codeInternal},
		{"list bad id", http.MethodGet, "/v1/jobs", h.user, &fakeJobs{job: jobs.Job{ID: "nope"}}, nil, http.StatusInternalServerError, codeInternal},
		{"get", http.MethodGet, path, h.user, &fakeJobs{job: sampleJob()}, nil, http.StatusOK, ""},
		{"get missing", http.MethodGet, path, h.user, &fakeJobs{getErr: jobs.ErrNotFound}, nil, http.StatusNotFound, jobs.CodeNotFound},
		{"get failure", http.MethodGet, path, h.user, &fakeJobs{getErr: errors.New("db")}, nil, http.StatusInternalServerError, codeInternal},
		{"get bad id", http.MethodGet, path, h.user, &fakeJobs{job: jobs.Job{ID: "nope"}}, nil, http.StatusInternalServerError, codeInternal},
		{"cancel", http.MethodPost, path + "/cancel", h.user, &fakeJobs{job: sampleJob()}, &fakeAudit{}, http.StatusAccepted, ""},
		{"cancel audit failure", http.MethodPost, path + "/cancel", h.user, &fakeJobs{job: sampleJob()}, &fakeAudit{err: errors.New("db")}, http.StatusAccepted, ""},
		{"cancel missing", http.MethodPost, path + "/cancel", h.user, &fakeJobs{getErr: jobs.ErrNotFound}, nil, http.StatusNotFound, jobs.CodeNotFound},
		{"cancel lookup failure", http.MethodPost, path + "/cancel", h.user, &fakeJobs{getErr: errors.New("db")}, nil, http.StatusInternalServerError, codeInternal},
		{"cancel finished", http.MethodPost, path + "/cancel", h.user, &fakeJobs{cancelErr: jobs.ErrNotCancellable}, nil, http.StatusConflict, jobs.CodeNotRunning},
		{"cancel failure", http.MethodPost, path + "/cancel", h.user, &fakeJobs{cancelErr: errors.New("river")}, nil, http.StatusInternalServerError, codeInternal},
		{"cancel reload failure", http.MethodPost, path + "/cancel", h.user, &fakeJobs{job: sampleJob(), getErrAfter: true}, &fakeAudit{}, http.StatusInternalServerError, codeInternal},
		{"cancel bad id", http.MethodPost, path + "/cancel", h.user, &fakeJobs{job: jobs.Job{ID: "nope"}}, &fakeAudit{}, http.StatusInternalServerError, codeInternal},
		{"logs", http.MethodGet, path + "/logs?after=3", h.user, &fakeJobs{job: sampleJob()}, nil, http.StatusOK, ""},
		{"logs default", http.MethodGet, path + "/logs", h.user, &fakeJobs{job: sampleJob()}, nil, http.StatusOK, ""},
		{"logs missing", http.MethodGet, path + "/logs", h.user, &fakeJobs{getErr: jobs.ErrNotFound}, nil, http.StatusNotFound, jobs.CodeNotFound},
		{"logs lookup failure", http.MethodGet, path + "/logs", h.user, &fakeJobs{getErr: errors.New("db")}, nil, http.StatusInternalServerError, codeInternal},
		{"logs failure", http.MethodGet, path + "/logs", h.user, &fakeJobs{logErr: errors.New("db")}, nil, http.StatusInternalServerError, codeInternal},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			auditLog := tc.audit
			if auditLog == nil {
				auditLog = &fakeAudit{}
			}
			recorder, failure := h.call(Deps{Jobs: tc.jobs, Audit: auditLog}, tc.method, tc.target, tc.token, "")
			if recorder.Code != tc.status || failure.Code != tc.code {
				t.Fatalf("got %d %q, want %d %q: %s", recorder.Code, failure.Code, tc.status, tc.code, recorder.Body.String())
			}
		})
	}
}

func TestJobsScopeToOwnerUnlessAdmin(t *testing.T) {
	h := newJobsHarness(t)
	fake := &fakeJobs{job: sampleJob()}
	h.call(Deps{Jobs: fake}, http.MethodGet, "/v1/jobs", h.user, "")
	h.call(Deps{Jobs: fake}, http.MethodGet, "/v1/jobs", h.admin, "")
	if len(fake.owners) != 2 || fake.owners[0] != "bob" || fake.owners[1] != "" {
		t.Fatalf("owners %v", fake.owners)
	}
}

func TestJobHandlersRefuseWithoutPrincipal(t *testing.T) {
	s := &server{deps: Deps{Logger: slog.New(slog.NewTextHandler(io.Discard, nil))}}
	ctx := context.Background()
	start, _ := s.StartFolderSize(ctx, api.StartFolderSizeRequestObject{Body: &api.FolderSizeRequest{}})
	list, _ := s.ListJobs(ctx, api.ListJobsRequestObject{})
	get, _ := s.GetJob(ctx, api.GetJobRequestObject{})
	cancel, _ := s.CancelJob(ctx, api.CancelJobRequestObject{})
	logs, _ := s.GetJobLogs(ctx, api.GetJobLogsRequestObject{})
	_, startOK := start.(api.StartFolderSize401JSONResponse)
	_, listOK := list.(api.ListJobs401JSONResponse)
	_, getOK := get.(api.GetJob401JSONResponse)
	_, cancelOK := cancel.(api.CancelJob401JSONResponse)
	_, logsOK := logs.(api.GetJobLogs401JSONResponse)
	if !startOK || !listOK || !getOK || !cancelOK || !logsOK {
		t.Fatalf("%T %T %T %T %T", start, list, get, cancel, logs)
	}
	recorder := httptest.NewRecorder()
	s.jobEvents(recorder, httptest.NewRequest(http.MethodGet, "/v1/jobs/events", nil))
	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("events without principal: %d", recorder.Code)
	}
}

func TestJobEvents(t *testing.T) {
	h := newJobsHarness(t)
	notices := make(chan jobs.Notice, 3)
	streamsDone := make(chan struct{})
	fake := &fakeJobs{job: sampleJob(), notices: notices}
	router := NewRouter(Deps{
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)), Database: pingOK{}, Verifier: h.verify,
		Jobs: fake, StreamsDone: streamsDone,
	})
	httpServer := httptest.NewServer(router)
	t.Cleanup(httpServer.Close)

	request, _ := http.NewRequestWithContext(context.Background(), http.MethodGet, httpServer.URL+"/v1/jobs/events", nil)
	request.Header.Set("Authorization", "Bearer "+h.user)
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = response.Body.Close() }()
	if response.Header.Get("Content-Type") != "text/event-stream" {
		t.Fatalf("content type %q", response.Header.Get("Content-Type"))
	}
	reader := bufio.NewReader(response.Body)
	expectLine(t, reader, ": connected")

	notices <- jobs.Notice{ID: jobID, Owner: "bob"}
	expectLine(t, reader, "event: job")
	data := expectLine(t, reader, "data: ")
	var job api.Job
	if err := json.Unmarshal([]byte(strings.TrimPrefix(data, "data: ")), &job); err != nil || job.Id.String() != jobID {
		t.Fatalf("event data %q: %v", data, err)
	}
	if !strings.Contains(data, `"createdAt":"1970-01-01T00:00:00Z"`) || !strings.Contains(data, `"startedAt":"1970-01-01T00:00:10Z"`) {
		t.Fatalf("times must be UTC: %s", data)
	}

	// A notice whose job cannot be loaded is skipped; the stream stays open.
	fake.getErr = errors.New("db")
	notices <- jobs.Notice{ID: jobID, Owner: "bob"}
	close(streamsDone)
	if rest, _ := io.ReadAll(reader); strings.Contains(string(rest), "event: job") {
		t.Fatalf("unexpected event after failure: %q", rest)
	}
}

func expectLine(t *testing.T, reader *bufio.Reader, prefix string) string {
	t.Helper()
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			t.Fatalf("stream ended waiting for %q: %v", prefix, err)
		}
		line = strings.TrimRight(line, "\n")
		if line == "" {
			continue
		}
		if !strings.HasPrefix(line, prefix) {
			t.Fatalf("line %q, want prefix %q", line, prefix)
		}
		return line
	}
}
