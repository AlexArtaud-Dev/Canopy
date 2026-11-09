package httpapi

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/api"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/authz"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/enginetoken"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/fsx"
)

func TestSearchFiles(t *testing.T) {
	public, private, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	verifier := enginetoken.NewVerifier(public, time.Now)
	userToken := signToken(t, private, nil)
	adminToken := signToken(t, private, []string{enginetoken.AdminPermission})
	bobGrants := fakeGrants{grants: []authz.Grant{
		{SubjectType: authz.SubjectUser, SubjectID: "bob", Path: "/docs/notes.txt", Actions: []string{"read", "download"}, Effect: authz.EffectAllow},
	}}

	cases := []struct {
		name   string
		token  string
		query  string
		files  Files
		grants Grants
		status int
		code   string
		names  []string
	}{
		{"no token", "", "path=/docs&q=no", fakeFiles{}, bobGrants, http.StatusUnauthorized, enginetoken.CodeMissing, nil},
		{"bad path", userToken, "path=docs&q=no", fakeFiles{}, bobGrants, http.StatusBadRequest, fsx.CodeInvalidPath, nil},
		{"short query", userToken, "path=/docs&q=%20n%20", fakeFiles{}, bobGrants, http.StatusBadRequest, codeInvalidQuery, nil},
		{"forbidden", userToken, "path=/other&q=no", fakeFiles{}, bobGrants, http.StatusForbidden, codeForbidden, nil},
		{"only what bob sees", userToken, "path=/docs&q=" + url.QueryEscape("TXT"), fakeFiles{}, bobGrants, http.StatusOK, "", []string{"notes.txt"}},
		{"admin sees all", adminToken, "path=/docs&q=txt", fakeFiles{}, fakeGrants{}, http.StatusOK, "", []string{"notes.txt", "secret.txt"}},
		{"not found", adminToken, "path=/missing&q=txt", fakeFiles{err: fsx.ErrNotFound}, fakeGrants{}, http.StatusNotFound, fsx.CodeNotFound, nil},
		{"not a dir", adminToken, "path=/a.txt&q=txt", fakeFiles{err: fsx.ErrNotDir}, fakeGrants{}, http.StatusNotFound, fsx.CodeNotDir, nil},
		{"io failure", adminToken, "path=/docs&q=txt", fakeFiles{err: errors.New("disk")}, fakeGrants{}, http.StatusInternalServerError, codeInternal, nil},
		{"grants failure", userToken, "path=/docs&q=txt", fakeFiles{}, fakeGrants{err: errors.New("db")}, http.StatusInternalServerError, codeInternal, nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			router := NewRouter(Deps{
				Logger: slog.New(slog.NewTextHandler(io.Discard, nil)), Database: pingOK{},
				Files: tc.files, Grants: tc.grants, Verifier: verifier,
			})
			request := httptest.NewRequest(http.MethodGet, "/v1/fs/search?"+tc.query, nil)
			if tc.token != "" {
				request.Header.Set("Authorization", "Bearer "+tc.token)
			}
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, request)
			if recorder.Code != tc.status {
				t.Fatalf("status %d, want %d: %s", recorder.Code, tc.status, recorder.Body.String())
			}
			if tc.code != "" {
				var body api.Error
				_ = json.Unmarshal(recorder.Body.Bytes(), &body)
				if body.Code != tc.code {
					t.Fatalf("code %q, want %q", body.Code, tc.code)
				}
				return
			}
			var results api.SearchResults
			if err := json.Unmarshal(recorder.Body.Bytes(), &results); err != nil {
				t.Fatal(err)
			}
			if len(results.Entries) != len(tc.names) || results.Truncated != nil {
				t.Fatalf("entries %+v, want %v", results.Entries, tc.names)
			}
			for i, entry := range results.Entries {
				if entry.Name != tc.names[i] || entry.Path != "/docs/"+tc.names[i] {
					t.Fatalf("entries %+v, want %v", results.Entries, tc.names)
				}
			}
		})
	}
}
