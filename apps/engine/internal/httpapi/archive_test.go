package httpapi

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"testing"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/api"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/archive"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/authz"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/fsx"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/jobs"
)

func TestArchiveEndpoints(t *testing.T) {
	h := newJobsHarness(t)
	resolver, dir := opsTree(t)
	if err := os.WriteFile(filepath.Join(dir, "docs", "pack.zip"), []byte("zip"), 0o644); err != nil {
		t.Fatal(err)
	}
	auditLog := &fakeAudit{}
	start := func(route, body string, jobsService *fakeJobs, grants Grants) (int, string) {
		recorder, failure := h.call(Deps{Ops: resolver, Grants: grants, Jobs: jobsService, Audit: auditLog}, http.MethodPost, route, h.user, body)
		return recorder.Code, failure.Code
	}
	fake := &fakeJobs{job: sampleJob()}
	if status, _ := start("/v1/jobs/compress", `{"sources":["/docs/a.txt","/docs/sub"],"format":"zip"}`, fake, bobCanWork); status != http.StatusAccepted ||
		fake.compress.Folder != "/docs" || fake.compress.Format != archive.Zip || len(auditLog.events) != 1 {
		t.Fatalf("compress: %d %+v", status, fake.compress)
	}
	accepted := []struct{ route, body string }{
		{"/v1/jobs/extract", `{"path":"/docs/pack.zip"}`},
		{"/v1/jobs/checksum", `{"path":"/docs/a.txt","algorithm":"sha256"}`},
	}
	for _, tc := range accepted {
		if status, code := start(tc.route, tc.body, fake, bobCanWork); status != http.StatusAccepted {
			t.Fatalf("%s: %d %s", tc.route, status, code)
		}
	}

	refusals := []struct {
		route, body string
		jobs        *fakeJobs
		grants      Grants
		status      int
		code        string
	}{
		{"/v1/jobs/compress", `{"sources":["/docs/a.txt"],"format":"rar"}`, fake, bobCanWork, http.StatusBadRequest, fsx.CodeInvalidPath},
		{"/v1/jobs/compress", `{"sources":["/"],"format":"zip"}`, fake, bobCanWork, http.StatusBadRequest, fsx.CodeInvalidPath},
		{"/v1/jobs/compress", `{"sources":["/docs/a.txt","/other/c.txt"],"format":"zip"}`, fake, bobCanWork, http.StatusBadRequest, archive.CodeMixedFolders},
		{"/v1/jobs/compress", `{"sources":["/locked/d.txt"],"format":"zip"}`, fake, bobCanWork, http.StatusForbidden, codeForbidden},
		{"/v1/jobs/compress", `{"sources":["/docs/a.txt"],"format":"zip"}`, fake, readOnlyDocs, http.StatusForbidden, codeForbidden},
		{"/v1/jobs/compress", `{"sources":["/docs/nope"],"format":"zip"}`, fake, bobCanWork, http.StatusNotFound, fsx.CodeNotFound},
		{"/v1/jobs/compress", `{"sources":["/docs/a.txt"],"format":"zip"}`, &fakeJobs{startErr: jobs.ErrTooMany}, bobCanWork, http.StatusTooManyRequests, jobs.CodeTooMany},
		{"/v1/jobs/compress", `{"sources":["/docs/a.txt"],"format":"zip"}`, fake, fakeGrants{err: errors.New("db")}, http.StatusInternalServerError, codeInternal},
		{"/v1/jobs/extract", `{"path":"docs"}`, fake, bobCanWork, http.StatusBadRequest, fsx.CodeInvalidPath},
		{"/v1/jobs/extract", `{"path":"/docs/a.txt"}`, fake, bobCanWork, http.StatusBadRequest, archive.CodeNotArchive},
		{"/v1/jobs/extract", `{"path":"/docs/none.zip"}`, fake, bobCanWork, http.StatusNotFound, fsx.CodeNotFound},
		{"/v1/jobs/extract", `{"path":"/docs/pack.zip"}`, fake, readOnlyDocs, http.StatusForbidden, codeForbidden},
		{"/v1/jobs/extract", `{"path":"/docs/pack.zip"}`, &fakeJobs{startErr: jobs.ErrTooMany}, bobCanWork, http.StatusTooManyRequests, jobs.CodeTooMany},
		{"/v1/jobs/extract", `{"path":"/docs/pack.zip"}`, fake, fakeGrants{err: errors.New("db")}, http.StatusInternalServerError, codeInternal},
		{"/v1/jobs/checksum", `{"path":"/docs/a.txt","algorithm":"crc"}`, fake, bobCanWork, http.StatusBadRequest, fsx.CodeInvalidPath},
		{"/v1/jobs/checksum", `{"path":"docs","algorithm":"md5"}`, fake, bobCanWork, http.StatusBadRequest, fsx.CodeInvalidPath},
		{"/v1/jobs/checksum", `{"path":"/docs/sub","algorithm":"md5"}`, fake, bobCanWork, http.StatusNotFound, fsx.CodeNotFound},
		{"/v1/jobs/checksum", `{"path":"/docs/a.txt","algorithm":"md5"}`, fake, readOnlyDocs, http.StatusForbidden, codeForbidden},
		{"/v1/jobs/checksum", `{"path":"/docs/a.txt","algorithm":"md5"}`, &fakeJobs{startErr: jobs.ErrTooMany}, bobCanWork, http.StatusTooManyRequests, jobs.CodeTooMany},
		{"/v1/jobs/checksum", `{"path":"/docs/a.txt","algorithm":"md5"}`, fake, fakeGrants{err: errors.New("db")}, http.StatusInternalServerError, codeInternal},
		{"/v1/jobs/checksum", `{"path":"/docs/a.txt","algorithm":"md5"}`, &fakeJobs{getErr: errors.New("db")}, bobCanWork, http.StatusInternalServerError, codeInternal},
		{"/v1/jobs/checksum", `{"path":"/docs/a.txt","algorithm":"md5"}`, &fakeJobs{job: jobs.Job{ID: "bad"}}, bobCanWork, http.StatusInternalServerError, codeInternal},
	}
	for _, tc := range refusals {
		if status, code := start(tc.route, tc.body, tc.jobs, tc.grants); status != tc.status || code != tc.code {
			t.Errorf("%s %s: got %d %q, want %d %q", tc.route, tc.body, status, code, tc.status, tc.code)
		}
	}
}

func TestArchiveRefuseWithoutPrincipal(t *testing.T) {
	s := &server{deps: Deps{Logger: slog.New(slog.NewTextHandler(io.Discard, nil))}}
	ctx := context.Background()
	compress, _ := s.StartCompress(ctx, api.StartCompressRequestObject{})
	extract, _ := s.StartExtract(ctx, api.StartExtractRequestObject{})
	checksum, _ := s.StartChecksum(ctx, api.StartChecksumRequestObject{})
	_, a := compress.(api.StartCompress401JSONResponse)
	_, b := extract.(api.StartExtract401JSONResponse)
	_, c := checksum.(api.StartChecksum401JSONResponse)
	if !a || !b || !c {
		t.Fatalf("%T %T %T", compress, extract, checksum)
	}
}

// readOnlyDocs lets bob read /docs and nothing else (no copy, create or download).
var readOnlyDocs = fakeGrants{grants: []authz.Grant{
	{SubjectType: authz.SubjectUser, SubjectID: "bob", Path: "/docs", Actions: []string{"read"}, Effect: authz.EffectAllow},
}}
