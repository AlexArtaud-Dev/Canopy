package httpapi

import (
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
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/api"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/authz"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/enginetoken"
)

func tokenWith(t *testing.T, private ed25519.PrivateKey, perms []string) string {
	t.Helper()
	now := time.Now()
	signed, err := jwt.NewWithClaims(jwt.SigningMethodEdDSA, jwt.MapClaims{
		"iss": "canopy-web", "aud": "canopy-engine", "sub": "admin", "sid": "s",
		"perms": perms, "groups": []string{}, "iat": now.Unix(), "exp": now.Add(time.Minute).Unix(),
	}).SignedString(private)
	if err != nil {
		t.Fatal(err)
	}
	return signed
}

func TestExplainAccess(t *testing.T) {
	public, private, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	grants := fakeGrants{grants: []authz.Grant{
		{ID: "g1", SubjectType: authz.SubjectGroup, SubjectID: "family", Path: "/media", Actions: []string{"read"}, Effect: authz.EffectAllow},
	}}
	cases := []struct {
		name   string
		perms  []string
		grants Grants
		body   string
		status int
		check  func(t *testing.T, body []byte)
	}{
		{"forbidden without users:read", nil, grants, `{"userId":"bob","groups":["family"],"admin":false,"path":"/media"}`, http.StatusForbidden, nil},
		{"invalid path", []string{"users:read"}, grants, `{"userId":"bob","groups":[],"admin":false,"path":"media"}`, http.StatusBadRequest, nil},
		{"grants failure", []string{"users:read"}, fakeGrants{err: errors.New("db")}, `{"userId":"bob","groups":[],"admin":false,"path":"/"}`, http.StatusInternalServerError, nil},
		{"explained", []string{"users:read"}, grants, `{"userId":"bob","groups":["family"],"admin":false,"path":"/media/x"}`, http.StatusOK, func(t *testing.T, body []byte) {
			var response api.ExplainResponse
			if err := json.Unmarshal(body, &response); err != nil {
				t.Fatal(err)
			}
			read := response.Decisions[0]
			if read.Action != "read" || !read.Allowed || read.Grant == nil || read.Grant.Id != "g1" {
				t.Fatalf("read: %+v", read)
			}
			if response.Decisions[1].Allowed || response.Decisions[1].Grant != nil {
				t.Fatalf("download: %+v", response.Decisions[1])
			}
		}},
		{"admin target bypasses", []string{enginetoken.AdminPermission}, fakeGrants{err: errors.New("unused")}, `{"userId":"root","groups":[],"admin":true,"path":"/"}`, http.StatusOK, func(t *testing.T, body []byte) {
			var response api.ExplainResponse
			_ = json.Unmarshal(body, &response)
			if !response.Decisions[0].ByAdmin {
				t.Fatalf("not by admin: %+v", response.Decisions[0])
			}
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			router := NewRouter(Deps{
				Logger: slog.New(slog.NewTextHandler(io.Discard, nil)), Database: pingOK{},
				Files: fakeFiles{}, Grants: tc.grants, Verifier: enginetoken.NewVerifier(public, time.Now),
			})
			request := httptest.NewRequest(http.MethodPost, "/v1/authz/explain", strings.NewReader(tc.body))
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set("Authorization", "Bearer "+tokenWith(t, private, tc.perms))
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, request)
			if recorder.Code != tc.status {
				t.Fatalf("status %d: %s", recorder.Code, recorder.Body.String())
			}
			if tc.check != nil {
				tc.check(t, recorder.Body.Bytes())
			}
		})
	}
}

func TestExplainAccessDefensive(t *testing.T) {
	s := &server{deps: Deps{Logger: slog.New(slog.NewTextHandler(io.Discard, nil))}}
	response, _ := s.ExplainAccess(context.Background(), api.ExplainAccessRequestObject{})
	if _, ok := response.(api.ExplainAccess401JSONResponse); !ok {
		t.Fatalf("no principal: %T", response)
	}
	ctx := enginetoken.WithPrincipal(context.Background(), enginetoken.Principal{Permissions: []string{"users:read"}})
	response, _ = s.ExplainAccess(ctx, api.ExplainAccessRequestObject{})
	if _, ok := response.(api.ExplainAccess400JSONResponse); !ok {
		t.Fatalf("no body: %T", response)
	}
}
