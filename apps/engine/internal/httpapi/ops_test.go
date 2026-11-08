package httpapi

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/api"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/authz"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/fsx"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/jobs"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/transfer"
)

// opsTree is a real resolver over a temp dir: write operations are tested against a filesystem.
func opsTree(t *testing.T) (*fsx.Resolver, string) {
	t.Helper()
	dir := t.TempDir()
	for _, name := range []string{"docs/a.txt", "docs/sub/b.txt", "other/c.txt", "locked/d.txt"} {
		full := filepath.Join(dir, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(full, []byte(name), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	resolver, err := fsx.OpenResolver(dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = resolver.Close() })
	return resolver, dir
}

// bobCanWork lets bob do everything in /docs and /other, nothing in /locked.
var bobCanWork = fakeGrants{grants: []authz.Grant{
	{SubjectType: authz.SubjectUser, SubjectID: "bob", Path: "/docs", Actions: authz.Actions, Effect: authz.EffectAllow},
	{SubjectType: authz.SubjectUser, SubjectID: "bob", Path: "/other", Actions: authz.Actions, Effect: authz.EffectAllow},
}}

func TestCreateFolderAndRename(t *testing.T) {
	h := newJobsHarness(t)
	resolver, dir := opsTree(t)
	deps := func(grants Grants) Deps {
		return Deps{Ops: resolver, Grants: grants, Audit: &fakeAudit{}}
	}
	cases := []struct {
		name   string
		target string
		body   string
		grants Grants
		status int
		code   string
	}{
		{"mkdir", "/v1/fs/mkdir", `{"path":"/docs/new"}`, bobCanWork, http.StatusCreated, ""},
		{"mkdir taken", "/v1/fs/mkdir", `{"path":"/docs/new"}`, bobCanWork, http.StatusConflict, fsx.CodeExists},
		{"mkdir forbidden", "/v1/fs/mkdir", `{"path":"/locked/new"}`, bobCanWork, http.StatusForbidden, codeForbidden},
		{"mkdir no parent", "/v1/fs/mkdir", `{"path":"/docs/x/y"}`, bobCanWork, http.StatusNotFound, fsx.CodeNotFound},
		{"mkdir bad path", "/v1/fs/mkdir", `{"path":"docs"}`, bobCanWork, http.StatusBadRequest, fsx.CodeInvalidPath},
		{"mkdir root", "/v1/fs/mkdir", `{"path":"/"}`, bobCanWork, http.StatusBadRequest, fsx.CodeInvalidName},
		{"mkdir grants failure", "/v1/fs/mkdir", `{"path":"/docs/z"}`, fakeGrants{err: errors.New("db")}, http.StatusInternalServerError, codeInternal},
		{"rename", "/v1/fs/rename", `{"path":"/docs/a.txt","name":"renamed.txt"}`, bobCanWork, http.StatusOK, ""},
		{"rename same name", "/v1/fs/rename", `{"path":"/docs/renamed.txt","name":"renamed.txt"}`, bobCanWork, http.StatusOK, ""},
		{"rename taken", "/v1/fs/rename", `{"path":"/docs/renamed.txt","name":"sub"}`, bobCanWork, http.StatusConflict, fsx.CodeExists},
		{"rename bad name", "/v1/fs/rename", `{"path":"/docs/renamed.txt","name":"a/b"}`, bobCanWork, http.StatusBadRequest, fsx.CodeInvalidName},
		{"rename bad path", "/v1/fs/rename", `{"path":"x","name":"y"}`, bobCanWork, http.StatusBadRequest, fsx.CodeInvalidPath},
		{"rename forbidden", "/v1/fs/rename", `{"path":"/locked/d.txt","name":"e.txt"}`, bobCanWork, http.StatusForbidden, codeForbidden},
		{"rename missing", "/v1/fs/rename", `{"path":"/docs/nope","name":"e.txt"}`, bobCanWork, http.StatusNotFound, fsx.CodeNotFound},
		{"rename grants failure", "/v1/fs/rename", `{"path":"/docs/sub","name":"e"}`, fakeGrants{err: errors.New("db")}, http.StatusInternalServerError, codeInternal},
	}
	for _, tc := range cases {
		recorder, failure := h.call(deps(tc.grants), http.MethodPost, tc.target, h.user, tc.body)
		if recorder.Code != tc.status || failure.Code != tc.code {
			t.Fatalf("%s: got %d %q, want %d %q: %s", tc.name, recorder.Code, failure.Code, tc.status, tc.code, recorder.Body.String())
		}
	}
	if _, err := os.Stat(filepath.Join(dir, "docs", "renamed.txt")); err != nil {
		t.Fatal("renamed on disk")
	}
	if _, err := os.Stat(filepath.Join(dir, "docs", "new")); err != nil {
		t.Fatal("created on disk")
	}
}

func TestTransferEndpoints(t *testing.T) {
	h := newJobsHarness(t)
	resolver, _ := opsTree(t)
	plan := func(body string, grants Grants) (int, string, string) {
		recorder, failure := h.call(Deps{Ops: resolver, Grants: grants}, http.MethodPost, "/v1/fs/transfer/plan", h.user, body)
		return recorder.Code, failure.Code, recorder.Body.String()
	}
	status, _, body := plan(`{"operation":"copy","sources":["/docs/a.txt"],"destination":"/docs"}`, bobCanWork)
	if status != http.StatusOK || !strings.Contains(body, `"self":true`) {
		t.Fatalf("self conflict: %d %s", status, body)
	}
	refusals := []struct {
		body   string
		grants Grants
		status int
		code   string
	}{
		{`{"operation":"delete","sources":["/docs/a.txt"],"destination":"/other"}`, bobCanWork, http.StatusBadRequest, fsx.CodeInvalidPath},
		{`{"operation":"copy","sources":["/docs"],"destination":"/docs/sub"}`, bobCanWork, http.StatusBadRequest, transfer.CodeIntoItself},
		{`{"operation":"move","sources":["/docs/a.txt"],"destination":"/docs"}`, bobCanWork, http.StatusBadRequest, transfer.CodeSameLocation},
		{`{"operation":"copy","sources":["/docs/a.txt","/other/a.txt"],"destination":"/other"}`, bobCanWork, http.StatusBadRequest, transfer.CodeDuplicateNames},
		{`{"operation":"copy","sources":["/docs/a.txt"],"destination":"/other/c.txt"}`, bobCanWork, http.StatusBadRequest, fsx.CodeNotDir},
		{`{"operation":"copy","sources":["/docs/a.txt"],"destination":"/nope"}`, bobCanWork, http.StatusNotFound, fsx.CodeNotFound},
		{`{"operation":"copy","sources":["/docs/nope"],"destination":"/other"}`, bobCanWork, http.StatusNotFound, fsx.CodeNotFound},
		{`{"operation":"copy","sources":["/docs/a.txt"],"destination":"/locked"}`, bobCanWork, http.StatusForbidden, codeForbidden},
		{`{"operation":"copy","sources":["/locked/d.txt"],"destination":"/other"}`, bobCanWork, http.StatusForbidden, codeForbidden},
		{`{"operation":"copy","sources":["/docs/a.txt"],"destination":"/other"}`, fakeGrants{err: errors.New("db")}, http.StatusInternalServerError, codeInternal},
	}
	for _, tc := range refusals {
		if status, code, body := plan(tc.body, tc.grants); status != tc.status || code != tc.code {
			t.Fatalf("plan %s: got %d %q %s", tc.body, status, code, body)
		}
	}

	fake := &fakeJobs{job: sampleJob()}
	auditLog := &fakeAudit{}
	start := func(body string, jobsService *fakeJobs) (int, string) {
		recorder, failure := h.call(Deps{Ops: resolver, Grants: bobCanWork, Jobs: jobsService, Audit: auditLog}, http.MethodPost, "/v1/jobs/transfer", h.user, body)
		return recorder.Code, failure.Code
	}
	status, _ = start(`{"operation":"move","sources":["/docs/a.txt"],"destination":"/other","strategy":"keep_both","decisions":{"/other/a.txt":"overwrite"}}`, fake)
	if status != http.StatusAccepted || fake.transfer.Decisions["/other/a.txt"] != transfer.StrategyOverwrite || fake.transfer.Subject.UserID != "bob" || len(auditLog.events) != 1 {
		t.Fatalf("queued: %d %+v %+v", status, fake.transfer, auditLog.events)
	}
	jobRefusals := []struct {
		body   string
		jobs   *fakeJobs
		status int
		code   string
	}{
		{`{"operation":"copy","sources":["/docs/a.txt"],"destination":"/other","strategy":"merge"}`, fake, http.StatusBadRequest, fsx.CodeInvalidPath},
		{`{"operation":"copy","sources":["/docs/a.txt"],"destination":"/locked","strategy":"skip"}`, fake, http.StatusForbidden, codeForbidden},
		{`{"operation":"copy","sources":["/docs/nope"],"destination":"/other","strategy":"skip"}`, fake, http.StatusNotFound, fsx.CodeNotFound},
		{`{"operation":"copy","sources":["/docs/a.txt"],"destination":"/other","strategy":"skip"}`, &fakeJobs{startErr: jobs.ErrTooMany}, http.StatusTooManyRequests, jobs.CodeTooMany},
		{`{"operation":"copy","sources":["/docs/a.txt"],"destination":"/other","strategy":"skip"}`, &fakeJobs{startErr: errors.New("db")}, http.StatusInternalServerError, codeInternal},
		{`{"operation":"copy","sources":["/docs/a.txt"],"destination":"/other","strategy":"skip"}`, &fakeJobs{getErr: errors.New("db")}, http.StatusInternalServerError, codeInternal},
		{`{"operation":"copy","sources":["/docs/a.txt"],"destination":"/other","strategy":"skip"}`, &fakeJobs{job: jobs.Job{ID: "bad"}}, http.StatusInternalServerError, codeInternal},
	}
	for _, tc := range jobRefusals {
		if status, code := start(tc.body, tc.jobs); status != tc.status || code != tc.code {
			t.Fatalf("start %s: got %d %q", tc.body, status, code)
		}
	}
}

func TestOpsRefuseWithoutPrincipal(t *testing.T) {
	s := &server{deps: Deps{Logger: slog.New(slog.NewTextHandler(io.Discard, nil))}}
	ctx := context.Background()
	mkdir, _ := s.CreateFolder(ctx, api.CreateFolderRequestObject{})
	rename, _ := s.RenameEntry(ctx, api.RenameEntryRequestObject{})
	plan, _ := s.PlanTransfer(ctx, api.PlanTransferRequestObject{})
	start, _ := s.StartTransfer(ctx, api.StartTransferRequestObject{})
	_, a := mkdir.(api.CreateFolder401JSONResponse)
	_, b := rename.(api.RenameEntry401JSONResponse)
	_, c := plan.(api.PlanTransfer401JSONResponse)
	_, d := start.(api.StartTransfer401JSONResponse)
	if !a || !b || !c || !d {
		t.Fatalf("%T %T %T %T", mkdir, rename, plan, start)
	}
}

func TestClassifyUnknown(t *testing.T) {
	if _, known := classify(errors.New("disk")); known {
		t.Fatal("unexpected errors stay internal")
	}
}
