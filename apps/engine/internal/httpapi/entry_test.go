package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"testing"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/api"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/fsx"
)

func TestStatEntry(t *testing.T) {
	h := newJobsHarness(t)
	resolver, _ := opsTree(t)
	call := func(target string, files Files, grants Grants, token string) (int, string, api.DirectoryEntry) {
		recorder, failure := h.call(Deps{Files: files, Grants: grants}, http.MethodGet, target, token, "")
		var entry api.DirectoryEntry
		_ = json.Unmarshal(recorder.Body.Bytes(), &entry)
		return recorder.Code, failure.Code, entry
	}
	status, _, entry := call("/v1/fs/entry?path=/docs/a.txt", resolver, bobCanWork, h.user)
	if status != http.StatusOK || entry.Name != "a.txt" || entry.Kind != api.File || len(entry.Actions) == 0 {
		t.Fatalf("file: %d %+v", status, entry)
	}
	if status, _, entry := call("/v1/fs/entry?path=/docs/sub", resolver, bobCanWork, h.user); status != http.StatusOK || entry.Kind != api.Directory {
		t.Fatalf("folder: %d %+v", status, entry)
	}
	refusals := []struct {
		target string
		files  Files
		grants Grants
		status int
		code   string
	}{
		{"/v1/fs/entry?path=docs", resolver, bobCanWork, http.StatusBadRequest, fsx.CodeInvalidPath},
		{"/v1/fs/entry?path=/docs/none", resolver, bobCanWork, http.StatusNotFound, fsx.CodeNotFound},
		{"/v1/fs/entry?path=/locked/d.txt", resolver, bobCanWork, http.StatusNotFound, fsx.CodeNotFound},
		{"/v1/fs/entry?path=/docs/a.txt", fakeFiles{err: errors.New("disk")}, bobCanWork, http.StatusInternalServerError, codeInternal},
		{"/v1/fs/entry?path=/docs/a.txt", resolver, fakeGrants{err: errors.New("db")}, http.StatusInternalServerError, codeInternal},
	}
	for _, tc := range refusals {
		if status, code, _ := call(tc.target, tc.files, tc.grants, h.user); status != tc.status || code != tc.code {
			t.Errorf("%s: %d %q, want %d %q", tc.target, status, code, tc.status, tc.code)
		}
	}
	s := &server{deps: Deps{Logger: slog.New(slog.NewTextHandler(io.Discard, nil))}}
	if response, _ := s.StatEntry(context.Background(), api.StatEntryRequestObject{}); response == nil {
		t.Fatal("no principal")
	} else if _, ok := response.(api.StatEntry401JSONResponse); !ok {
		t.Fatalf("%T", response)
	}
}
