package httpapi

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/api"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/authz"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/enginetoken"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/fsx"
)

type fakeFiles struct{ err error }

func (f fakeFiles) Stat(string) (fsx.Entry, error) { return fsx.Entry{}, f.err }

// Walk visits the folder itself, then what ReadDir returns.
func (f fakeFiles) Walk(dir string, visit func(string, fsx.Entry) error) error {
	entries, err := f.ReadDir(dir)
	if err != nil {
		return err
	}
	if err := visit(dir, fsx.Entry{IsDir: true}); err != nil {
		return err
	}
	for _, entry := range entries {
		if err := visit(path.Join(dir, entry.Name), entry); err != nil && !errors.Is(err, fs.SkipDir) {
			return err
		}
	}
	return nil
}

func (f fakeFiles) ReadDir(string) ([]fsx.Entry, error) {
	if f.err != nil {
		return nil, f.err
	}
	return []fsx.Entry{
		{Name: "photos", IsDir: true},
		{Name: "notes.txt", Size: 5, Modified: time.Unix(0, 0)},
		{Name: "secret.txt", Size: 1},
	}, nil
}

type fakeGrants struct {
	grants []authz.Grant
	err    error
}

func (f fakeGrants) GrantsFor(context.Context, authz.Subject) ([]authz.Grant, error) {
	return f.grants, f.err
}

type pingOK struct{}

func (pingOK) Ping(context.Context) error { return nil }

func signToken(t *testing.T, private ed25519.PrivateKey, perms []string) string {
	t.Helper()
	now := time.Now()
	token := jwt.NewWithClaims(jwt.SigningMethodEdDSA, jwt.MapClaims{
		"iss": "canopy-web", "aud": "canopy-engine", "sub": "bob", "sid": "s1",
		"perms": perms, "groups": []string{"family"},
		"iat": now.Unix(), "exp": now.Add(time.Minute).Unix(),
	})
	signed, err := token.SignedString(private)
	if err != nil {
		t.Fatal(err)
	}
	return signed
}

func TestListDirectory(t *testing.T) {
	public, private, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	verifier := enginetoken.NewVerifier(public, time.Now)
	userToken := signToken(t, private, nil)
	adminToken := signToken(t, private, []string{enginetoken.AdminPermission})
	bobGrants := fakeGrants{grants: []authz.Grant{
		{SubjectType: authz.SubjectGroup, SubjectID: "family", Path: "/docs/notes.txt", Actions: []string{"read"}, Effect: authz.EffectAllow},
		{SubjectType: authz.SubjectUser, SubjectID: "bob", Path: "/docs/photos", Actions: []string{"read"}, Effect: authz.EffectAllow},
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
		{"no token", "", "path=/docs", fakeFiles{}, bobGrants, http.StatusUnauthorized, enginetoken.CodeMissing, nil},
		{"bad path", userToken, "path=docs", fakeFiles{}, bobGrants, http.StatusBadRequest, fsx.CodeInvalidPath, nil},
		{"forbidden", userToken, "path=/other", fakeFiles{}, bobGrants, http.StatusForbidden, codeForbidden, nil},
		{"filtered", userToken, "path=/docs", fakeFiles{}, bobGrants, http.StatusOK, "", []string{"photos", "notes.txt"}},
		{"admin sees all, dirs only", adminToken, "path=/docs&dirsOnly=true&sort=size&order=desc&offset=0&limit=5", fakeFiles{}, fakeGrants{}, http.StatusOK, "", []string{"photos"}},
		{"not found", adminToken, "path=/missing", fakeFiles{err: fsx.ErrNotFound}, fakeGrants{}, http.StatusNotFound, fsx.CodeNotFound, nil},
		{"not a dir", adminToken, "path=/a.txt", fakeFiles{err: fsx.ErrNotDir}, fakeGrants{}, http.StatusNotFound, fsx.CodeNotDir, nil},
		{"host denied", adminToken, "path=/media/H", fakeFiles{err: fmt.Errorf("%w: %w", fsx.ErrHostDenied, fsx.ErrNotFound)}, fakeGrants{}, http.StatusForbidden, fsx.CodeHostDenied, nil},
		{"io failure", adminToken, "path=/docs", fakeFiles{err: errors.New("disk")}, fakeGrants{}, http.StatusInternalServerError, codeInternal, nil},
		{"grants failure", userToken, "path=/docs", fakeFiles{}, fakeGrants{err: errors.New("db")}, http.StatusInternalServerError, codeInternal, nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			router := NewRouter(Deps{
				Logger: slog.New(slog.NewTextHandler(io.Discard, nil)), Database: pingOK{},
				Files: tc.files, Grants: tc.grants, Verifier: verifier,
			})
			request := httptest.NewRequest(http.MethodGet, "/v1/fs/list?"+tc.query, nil)
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
			var listing api.DirectoryListing
			if err := json.Unmarshal(recorder.Body.Bytes(), &listing); err != nil {
				t.Fatal(err)
			}
			got := make([]string, 0, len(listing.Entries))
			for _, entry := range listing.Entries {
				got = append(got, entry.Name)
			}
			if len(got) != len(tc.names) {
				t.Fatalf("entries %v, want %v", got, tc.names)
			}
			for i := range got {
				if got[i] != tc.names[i] {
					t.Fatalf("entries %v, want %v", got, tc.names)
				}
			}
		})
	}
}

func TestListDirectoryWithoutPrincipal(t *testing.T) {
	// Defence in depth: the handler refuses even if the middleware were bypassed.
	s := &server{deps: Deps{Logger: slog.New(slog.NewTextHandler(io.Discard, nil))}}
	response, err := s.ListDirectory(context.Background(), api.ListDirectoryRequestObject{})
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := response.(api.ListDirectory401JSONResponse); !ok {
		t.Fatalf("got %T", response)
	}
}

func TestHealthStaysOpenWithoutKey(t *testing.T) {
	router := NewRouter(Deps{Logger: slog.New(slog.NewTextHandler(io.Discard, nil)), Database: pingOK{}})
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/healthz", nil))
	if recorder.Code != http.StatusOK {
		t.Fatalf("healthz = %d", recorder.Code)
	}
	recorder = httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/v1/fs/list?path=/", nil))
	if recorder.Code != http.StatusServiceUnavailable {
		t.Fatalf("v1 without key = %d", recorder.Code)
	}
}
