package uploads

import (
	"context"
	"encoding/base64"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/audit"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/authz"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/enginetoken"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/fsx"
)

type fakeGrants struct {
	grants []authz.Grant
	err    error
}

func (f fakeGrants) GrantsFor(context.Context, authz.Subject) ([]authz.Grant, error) {
	return f.grants, f.err
}

type fakeAudit struct {
	mu     sync.Mutex
	events []audit.Event
}

func (f *fakeAudit) Record(_ context.Context, event audit.Event) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.events = append(f.events, event)
	return nil
}

type harness struct {
	t       *testing.T
	dir     string
	service *Service
	audit   *fakeAudit
	limits  Limits
	grants  fakeGrants
}

// bob may upload into /in; uploads into /in/locked are denied to him.
func newHarness(t *testing.T) *harness {
	t.Helper()
	dir := t.TempDir()
	for _, name := range []string{"in/existing.txt", "in/locked/x.txt", "in/folder/keep.txt"} {
		full := filepath.Join(dir, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(full, []byte("old"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	resolver, err := fsx.OpenResolver(dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = resolver.Close() })
	h := &harness{t: t, dir: dir, audit: &fakeAudit{}, grants: fakeGrants{grants: []authz.Grant{
		{SubjectType: authz.SubjectUser, SubjectID: "bob", Path: "/in", Actions: []string{"read", "upload", "create", "update"}, Effect: authz.EffectAllow},
		{SubjectType: authz.SubjectUser, SubjectID: "bob", Path: "/in/locked", Actions: []string{"upload", "update"}, Effect: authz.EffectDeny},
	}}}
	h.service, err = New(Config{
		Root:   dir,
		Stager: resolver,
		Files:  resolver,
		Grants: &h.grants,
		Audit:  h.audit,
		Limits: func(context.Context) (Limits, error) { return h.limits, nil },
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
		Now:    time.Now,
	})
	if err != nil {
		t.Fatal(err)
	}
	return h
}

func (h *harness) do(user, method, target string, header map[string]string, body string) *httptest.ResponseRecorder {
	h.t.Helper()
	request := httptest.NewRequest(method, target, strings.NewReader(body))
	request.Header.Set("Tus-Resumable", "1.0.0")
	for name, value := range header {
		request.Header.Set(name, value)
	}
	request = request.WithContext(enginetoken.WithPrincipal(request.Context(), enginetoken.Principal{UserID: user}))
	recorder := httptest.NewRecorder()
	h.service.ServeHTTP(recorder, request)
	return recorder
}

func metadata(pairs map[string]string) string {
	parts := make([]string, 0, len(pairs))
	for key, value := range pairs {
		parts = append(parts, key+" "+base64.StdEncoding.EncodeToString([]byte(value)))
	}
	return strings.Join(parts, ",")
}

// upload creates and fills one upload; returns the creation and the final responses.
func (h *harness) upload(meta map[string]string, content string) (*httptest.ResponseRecorder, *httptest.ResponseRecorder) {
	h.t.Helper()
	created := h.do("bob", http.MethodPost, BasePath, map[string]string{
		"Upload-Length": strconv.Itoa(len(content)), "Upload-Metadata": metadata(meta),
	}, "")
	if created.Code != http.StatusCreated {
		return created, nil
	}
	location := created.Header().Get("Location")
	target := uploadPath(h.t, location)
	finished := h.do("bob", http.MethodPatch, target, map[string]string{
		"Upload-Offset": "0", "Content-Type": "application/offset+octet-stream",
	}, content)
	return created, finished
}

func (h *harness) read(name string) string {
	data, err := os.ReadFile(filepath.Join(h.dir, filepath.FromSlash(name)))
	if err != nil {
		return "<missing>"
	}
	return string(data)
}

func TestUploadFlows(t *testing.T) {
	h := newHarness(t)

	_, finished := h.upload(map[string]string{"destination": "/in", "filename": "new.txt"}, "hello")
	if finished == nil || finished.Code != http.StatusNoContent || finished.Header().Get(HeaderPath) != "/in/new.txt" || h.read("in/new.txt") != "hello" {
		t.Fatalf("simple upload: %+v %q", finished, h.read("in/new.txt"))
	}
	if len(h.audit.events) != 1 || h.audit.events[0].Action != "fs.upload" {
		t.Fatalf("audited: %+v", h.audit.events)
	}

	_, finished = h.upload(map[string]string{"destination": "/in", "filename": "existing.txt", "strategy": "keep_both"}, "copy")
	if finished.Header().Get(HeaderPath) != "/in/existing (1).txt" || h.read("in/existing (1).txt") != "copy" || h.read("in/existing.txt") != "old" {
		t.Fatalf("keep both: %v", finished.Header())
	}
	_, finished = h.upload(map[string]string{"destination": "/in", "filename": "existing.txt", "strategy": "overwrite"}, "replaced")
	if finished.Code != http.StatusNoContent || h.read("in/existing.txt") != "replaced" {
		t.Fatalf("overwrite: %d %q", finished.Code, h.read("in/existing.txt"))
	}
	_, finished = h.upload(map[string]string{"destination": "/in", "filename": "deep.txt", "relativeDir": "trip/day 1"}, "d")
	if finished.Header().Get(HeaderPath) != "/in/trip/day 1/deep.txt" || h.read("in/trip/day 1/deep.txt") != "d" {
		t.Fatalf("folder upload: %v", finished.Header())
	}

	staged, _ := os.ReadDir(filepath.Join(h.dir, "in", fsx.StagingDir))
	for _, entry := range staged {
		if !strings.HasSuffix(entry.Name(), ".lock") {
			t.Fatalf("staging is emptied after each upload: %s", entry.Name())
		}
	}
}

func TestUploadRefusals(t *testing.T) {
	h := newHarness(t)
	h.limits = Limits{MaxBytes: 4, Blocked: []string{"exe"}}
	cases := []struct {
		name   string
		meta   map[string]string
		body   string
		status int
		code   string
	}{
		{"conflict skip", map[string]string{"destination": "/in", "filename": "existing.txt"}, "x", http.StatusConflict, fsx.CodeExists},
		{"folder over overwrite", map[string]string{"destination": "/in", "filename": "folder", "strategy": "overwrite"}, "x", http.StatusConflict, fsx.CodeExists},
		{"too large", map[string]string{"destination": "/in", "filename": "big.bin"}, "12345", http.StatusRequestEntityTooLarge, CodeTooLarge},
		{"blocked type", map[string]string{"destination": "/in", "filename": "setup.exe"}, "x", http.StatusUnsupportedMediaType, CodeBlockedType},
		{"forbidden", map[string]string{"destination": "/in/locked", "filename": "a.txt"}, "x", http.StatusForbidden, "files.forbidden"},
		{"no destination", map[string]string{"destination": "/nope", "filename": "a.txt"}, "x", http.StatusNotFound, fsx.CodeNotFound},
		{"destination is a file", map[string]string{"destination": "/in/existing.txt", "filename": "a.txt"}, "x", http.StatusNotFound, fsx.CodeNotFound},
		{"bad metadata", map[string]string{"destination": "/in", "filename": "../x"}, "x", http.StatusBadRequest, CodeBadMetadata},
	}
	for _, tc := range cases {
		created, _ := h.upload(tc.meta, tc.body)
		if created.Code != tc.status || !strings.HasPrefix(created.Body.String(), tc.code+":") {
			t.Errorf("%s: %d %q", tc.name, created.Code, created.Body.String())
		}
	}

	h.grants.err = errors.New("db")
	if created, _ := h.upload(map[string]string{"destination": "/in", "filename": "a.txt"}, "x"); created.Code != http.StatusInternalServerError {
		t.Fatalf("grants failure: %d", created.Code)
	}
	h.grants.err = nil
	h.service.cfg.Limits = func(context.Context) (Limits, error) { return Limits{}, errors.New("db") }
	if created, _ := h.upload(map[string]string{"destination": "/in", "filename": "a.txt"}, "x"); created.Code != http.StatusInternalServerError {
		t.Fatalf("limits failure: %d", created.Code)
	}
}

func TestUploadsBelongToTheirOwner(t *testing.T) {
	h := newHarness(t)
	created := h.do("bob", http.MethodPost, BasePath, map[string]string{
		"Upload-Length": "5", "Upload-Metadata": metadata(map[string]string{"destination": "/in", "filename": "mine.txt"}),
	}, "")
	location := created.Header().Get("Location")
	target := uploadPath(h.t, location)

	if got := h.do("eve", http.MethodHead, target, nil, ""); got.Code != http.StatusNotFound {
		t.Fatalf("another person cannot see it: %d", got.Code)
	}
	if got := h.do("bob", http.MethodHead, target, nil, ""); got.Code != http.StatusOK || got.Header().Get("Upload-Offset") != "0" {
		t.Fatalf("the owner resumes it: %d %v", got.Code, got.Header())
	}
	if got := h.do("bob", http.MethodHead, BasePath+"..%2Fetc", nil, ""); got.Code != http.StatusNotFound {
		t.Fatalf("ids are never paths: %d", got.Code)
	}

	// The name gets taken while the upload runs: "skip" discards it at the end.
	if err := os.WriteFile(filepath.Join(h.dir, "in", "mine.txt"), []byte("first"), 0o644); err != nil {
		t.Fatal(err)
	}
	finished := h.do("bob", http.MethodPatch, target, map[string]string{
		"Upload-Offset": "0", "Content-Type": "application/offset+octet-stream",
	}, "later")
	if finished.Header().Get(HeaderResult) != "skipped" || h.read("in/mine.txt") != "first" {
		t.Fatalf("skipped at the end: %v %q", finished.Header(), h.read("in/mine.txt"))
	}

	// Without a principal nothing is created.
	request := httptest.NewRequest(http.MethodPost, BasePath, nil)
	request.Header.Set("Tus-Resumable", "1.0.0")
	request.Header.Set("Upload-Length", "1")
	request.Header.Set("Upload-Metadata", metadata(map[string]string{"destination": "/in", "filename": "a"}))
	recorder := httptest.NewRecorder()
	h.service.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("anonymous: %d", recorder.Code)
	}
}

func TestPurgeStale(t *testing.T) {
	h := newHarness(t)
	h.do("bob", http.MethodPost, BasePath, map[string]string{
		"Upload-Length": "5", "Upload-Metadata": metadata(map[string]string{"destination": "/in", "filename": "slow.txt"}),
	}, "")
	if purged := h.service.PurgeStale(time.Hour); purged != 0 {
		t.Fatal("recent uploads stay")
	}
	h.service.cfg.Now = func() time.Time { return time.Now().Add(48 * time.Hour) }
	if purged := h.service.PurgeStale(24 * time.Hour); purged != 1 {
		t.Fatalf("abandoned upload purged: %d", purged)
	}
	h.service.cfg.Root = filepath.Join(h.dir, "missing")
	if h.service.PurgeStale(time.Hour) != 0 {
		t.Fatal("missing root")
	}
}

func TestFinishRechecks(t *testing.T) {
	h := newHarness(t)
	start := func(meta map[string]string) string {
		created := h.do("bob", http.MethodPost, BasePath, map[string]string{"Upload-Length": "1", "Upload-Metadata": metadata(meta)}, "")
		location := created.Header().Get("Location")
		return uploadPath(h.t, location)
	}
	finish := func(target string) *httptest.ResponseRecorder {
		return h.do("bob", http.MethodPatch, target, map[string]string{
			"Upload-Offset": "0", "Content-Type": "application/offset+octet-stream",
		}, "x")
	}

	// Access revoked during a long upload: refused at the end, nothing lands.
	revoked := start(map[string]string{"destination": "/in", "filename": "late.txt"})
	h.grants.grants = nil
	if got := finish(revoked); got.Code != http.StatusForbidden || h.read("in/late.txt") != "<missing>" {
		t.Fatalf("revoked: %d", got.Code)
	}

	// Overwrite chosen, but the name became a folder meanwhile: skipped, never replaced.
	h = newHarness(t)
	target := start(map[string]string{"destination": "/in", "filename": "turned", "strategy": "overwrite"})
	if err := os.MkdirAll(filepath.Join(h.dir, "in", "turned"), 0o755); err != nil {
		t.Fatal(err)
	}
	if got := finish(target); got.Header().Get(HeaderResult) != "skipped" {
		t.Fatalf("folder kept: %v", got.Header())
	}
}

// uploadPath is the path part of a tus Location header.
func uploadPath(t *testing.T, location string) string {
	t.Helper()
	parsed, err := url.Parse(location)
	if err != nil || !strings.HasPrefix(parsed.Path, BasePath) {
		t.Fatalf("unexpected location %q", location)
	}
	return parsed.Path
}
