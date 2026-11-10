package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"io/fs"
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

func TestEntryProperties(t *testing.T) {
	h := newJobsHarness(t)
	resolver, _ := opsTree(t)
	deps := Deps{Files: resolver, Ops: resolver, Grants: bobCanWork}
	call := func(d Deps, target string) (int, string, api.EntryProperties) {
		recorder, failure := h.call(d, http.MethodGet, target, h.user, "")
		var body api.EntryProperties
		_ = json.Unmarshal(recorder.Body.Bytes(), &body)
		return recorder.Code, failure.Code, body
	}
	status, _, file := call(deps, "/v1/fs/properties?path=/docs/a.txt")
	if status != http.StatusOK || file.Entry.Name != "a.txt" || file.Link || file.Mode[0] != '-' ||
		file.MimeType == nil || *file.MimeType != "text/plain; charset=utf-8" {
		t.Fatalf("file: %d %+v", status, file)
	}
	status, _, folder := call(deps, "/v1/fs/properties?path=/docs/sub")
	if status != http.StatusOK || folder.Mode[0] != 'd' || folder.MimeType != nil {
		t.Fatalf("folder: %d %+v", status, folder)
	}
	for target, want := range map[string]int{
		"/v1/fs/properties?path=docs":          http.StatusBadRequest,
		"/v1/fs/properties?path=/docs/none":    http.StatusNotFound,
		"/v1/fs/properties?path=/locked/d.txt": http.StatusNotFound,
	} {
		if got, _, _ := call(deps, target); got != want {
			t.Errorf("%s: %d, want %d", target, got, want)
		}
	}
	broken := Deps{Files: resolver, Ops: resolver, Grants: fakeGrants{err: errors.New("db")}}
	if got, code, _ := call(broken, "/v1/fs/properties?path=/docs/a.txt"); got != http.StatusInternalServerError || code != codeInternal {
		t.Fatalf("grants failure: %d %q", got, code)
	}
	s := &server{deps: Deps{Logger: slog.New(slog.NewTextHandler(io.Discard, nil))}}
	if response, _ := s.GetEntryProperties(context.Background(), api.GetEntryPropertiesRequestObject{}); response == nil {
		t.Fatal("no principal")
	} else if _, ok := response.(api.GetEntryProperties401JSONResponse); !ok {
		t.Fatalf("%T", response)
	}
}

func TestPropertyHelpers(t *testing.T) {
	modes := map[fs.FileMode]string{
		0o640:                    "-rw-r-----",
		fs.ModeDir | 0o750:       "drwxr-x---",
		fs.ModeSymlink | 0o777:   "lrwxrwxrwx",
		fs.ModeNamedPipe | 0o600: "?rw-------",
	}
	for mode, want := range modes {
		if got := lsMode(mode); got != want {
			t.Errorf("%v: %q, want %q", mode, got, want)
		}
	}
	if got := mimeTypeOf("/a/clip.mkv"); got == nil || *got != "video/x-matroska" {
		t.Fatalf("previewer table: %v", got)
	}
	if got := mimeTypeOf("/a/b.unknownext"); got != nil {
		t.Fatalf("unknown: %v", *got)
	}
}
