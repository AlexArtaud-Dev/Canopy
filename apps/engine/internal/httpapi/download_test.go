package httpapi

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/authz"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/enginetoken"
)

func streamTicket(t *testing.T, private ed25519.PrivateKey) string {
	t.Helper()
	now := time.Now()
	token := jwt.NewWithClaims(jwt.SigningMethodEdDSA, jwt.MapClaims{
		"iss": "canopy-web", "aud": enginetoken.StreamAudience, "sub": "bob", "sid": "s1",
		"perms": []string{}, "groups": []string{},
		"iat": now.Unix(), "exp": now.Add(time.Minute).Unix(),
	})
	signed, err := token.SignedString(private)
	if err != nil {
		t.Fatal(err)
	}
	return signed
}

func streamDeps(t *testing.T, grants Grants) (Deps, *fakeAudit) {
	t.Helper()
	resolver, _ := opsTree(t)
	auditLog := &fakeAudit{}
	return Deps{Ops: resolver, Grants: grants, Audit: auditLog}, auditLog
}

func get(t *testing.T, deps Deps, verifier *enginetoken.Verifier, target, token string, header map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	deps.Logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	deps.Database = pingOK{}
	deps.Verifier = verifier
	request := httptest.NewRequest(http.MethodGet, target, nil)
	request.Header.Set("Authorization", "Bearer "+token)
	for name, value := range header {
		request.Header.Set(name, value)
	}
	recorder := httptest.NewRecorder()
	NewRouter(deps).ServeHTTP(recorder, request)
	return recorder
}

func TestDownload(t *testing.T) {
	public, private, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	verifier := enginetoken.NewVerifier(public, time.Now)
	ticket := streamTicket(t, private)
	deps, auditLog := streamDeps(t, bobCanWork)

	full := get(t, deps, verifier, "/v1/fs/download?path=/docs/a.txt", ticket, nil)
	if full.Code != http.StatusOK || full.Body.String() != "docs/a.txt" ||
		!strings.Contains(full.Header().Get("Content-Disposition"), `filename="a.txt"`) {
		t.Fatalf("full: %d %q %v", full.Code, full.Body.String(), full.Header())
	}
	part := get(t, deps, verifier, "/v1/fs/download?path=/docs/a.txt", ticket, map[string]string{"Range": "bytes=5-"})
	if part.Code != http.StatusPartialContent || part.Body.String() != "a.txt" {
		t.Fatalf("range: %d %q", part.Code, part.Body.String())
	}
	if len(auditLog.events) != 1 {
		t.Fatalf("a resumed range is not audited again: %d", len(auditLog.events))
	}

	refusals := []struct {
		target string
		status int
	}{
		{"/v1/fs/download?path=/locked/d.txt", http.StatusForbidden},
		{"/v1/fs/download?path=/docs/sub", http.StatusNotFound},
		{"/v1/fs/download?path=/docs/none", http.StatusNotFound},
		{"/v1/fs/download?path=docs", http.StatusBadRequest},
	}
	for _, tc := range refusals {
		if got := get(t, deps, verifier, tc.target, ticket, nil); got.Code != tc.status {
			t.Fatalf("%s: %d, want %d", tc.target, got.Code, tc.status)
		}
	}
	broken := deps
	broken.Grants = fakeGrants{err: errors.New("db")}
	if got := get(t, broken, verifier, "/v1/fs/download?path=/docs/a.txt", ticket, nil); got.Code != http.StatusInternalServerError {
		t.Fatalf("grants failure: %d", got.Code)
	}
	// A stream ticket never reaches the rest of the API.
	if got := get(t, deps, verifier, "/v1/jobs", ticket, nil); got.Code != http.StatusForbidden {
		t.Fatalf("stream ticket on the API: %d", got.Code)
	}
}

func TestArchive(t *testing.T) {
	public, private, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	verifier := enginetoken.NewVerifier(public, time.Now)
	ticket := streamTicket(t, private)
	noSub := fakeGrants{grants: append(append([]authz.Grant{}, bobCanWork.grants...),
		authz.Grant{SubjectType: authz.SubjectUser, SubjectID: "bob", Path: "/docs/sub/b.txt", Actions: []string{"download"}, Effect: authz.EffectDeny})}
	deps, _ := streamDeps(t, noSub)

	response := get(t, deps, verifier, "/v1/fs/archive?path=/docs&path=/other/c.txt", ticket, nil)
	if response.Code != http.StatusOK || response.Header().Get("Content-Type") != "application/zip" ||
		!strings.Contains(response.Header().Get("Content-Disposition"), "canopy.zip") {
		t.Fatalf("archive: %d %v", response.Code, response.Header())
	}
	reader, err := zip.NewReader(bytes.NewReader(response.Body.Bytes()), int64(response.Body.Len()))
	if err != nil {
		t.Fatal(err)
	}
	var names []string
	for _, file := range reader.File {
		names = append(names, file.Name)
	}
	sort.Strings(names)
	want := []string{"c.txt", "docs/", "docs/a.txt", "docs/sub/"}
	if strings.Join(names, ",") != strings.Join(want, ",") {
		t.Fatalf("entries %v, want %v (the denied file is left out)", names, want)
	}

	refusals := []struct {
		target string
		status int
	}{
		{"/v1/fs/archive", http.StatusBadRequest},
		{"/v1/fs/archive?path=docs", http.StatusBadRequest},
		{"/v1/fs/archive?path=/docs/none", http.StatusNotFound},
		{"/v1/fs/archive?path=/locked", http.StatusForbidden},
	}
	for _, tc := range refusals {
		if got := get(t, deps, verifier, tc.target, ticket, nil); got.Code != tc.status {
			t.Fatalf("%s: %d, want %d", tc.target, got.Code, tc.status)
		}
	}
	broken := deps
	broken.Grants = fakeGrants{err: errors.New("db")}
	if got := get(t, broken, verifier, "/v1/fs/archive?path=/docs", ticket, nil); got.Code != http.StatusInternalServerError {
		t.Fatalf("grants failure: %d", got.Code)
	}
}

func TestDownloadHelpers(t *testing.T) {
	if got := ContentDisposition(`vacances "été".jpg`); got != `attachment; filename="vacances __t__.jpg"; filename*=UTF-8''vacances%20%22%C3%A9t%C3%A9%22.jpg` {
		t.Fatalf("disposition: %s", got)
	}
	cases := map[string][]string{
		"photos.zip": {"/media/photos"},
		"media.zip":  {"/media/a", "/media/b"},
		"canopy.zip": {"/a", "/b"},
	}
	for want, paths := range cases {
		if got := ArchiveName(paths); got != want {
			t.Errorf("ArchiveName(%v) = %s, want %s", paths, got, want)
		}
	}
	if ArchiveName([]string{"/"}) != "canopy.zip" {
		t.Fatal("root")
	}
	s := &server{deps: Deps{Logger: slog.New(slog.NewTextHandler(io.Discard, nil))}}
	for _, handler := range []http.HandlerFunc{s.download, s.archive} {
		recorder := httptest.NewRecorder()
		handler(recorder, httptest.NewRequest(http.MethodGet, "/", nil))
		if recorder.Code != http.StatusUnauthorized {
			t.Fatalf("no principal: %d", recorder.Code)
		}
	}
	cancelled, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := (contextReader{ctx: cancelled, reader: strings.NewReader("x")}).Read(make([]byte, 1)); !errors.Is(err, context.Canceled) {
		t.Fatal("a gone client stops the copy")
	}
}
