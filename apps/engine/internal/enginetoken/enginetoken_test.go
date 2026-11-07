package enginetoken

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

var now = time.Date(2026, 11, 7, 12, 0, 0, 0, time.UTC)

func keys(t *testing.T) (ed25519.PublicKey, ed25519.PrivateKey) {
	t.Helper()
	public, private, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	return public, private
}

type tokenOptions struct {
	issuer, audience, subject string
	lifetime                  time.Duration
	method                    jwt.SigningMethod
}

func sign(t *testing.T, private ed25519.PrivateKey, opts tokenOptions) string {
	t.Helper()
	if opts.method == nil {
		opts.method = jwt.SigningMethodEdDSA
	}
	token := jwt.NewWithClaims(opts.method, claims{
		SessionID:   "s1",
		Permissions: []string{"users:read", AdminPermission},
		Groups:      []string{"g1"},
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    opts.issuer,
			Audience:  jwt.ClaimStrings{opts.audience},
			Subject:   opts.subject,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(opts.lifetime)),
		},
	})
	var key any = private
	if opts.method == jwt.SigningMethodHS256 {
		key = []byte("shared secret")
	}
	signed, err := token.SignedString(key)
	if err != nil {
		t.Fatal(err)
	}
	return signed
}

func valid() tokenOptions {
	return tokenOptions{issuer: issuer, audience: audience, subject: "u1", lifetime: time.Minute}
}

func TestParsePublicKey(t *testing.T) {
	public, _ := keys(t)
	for _, encoded := range []string{
		base64.RawURLEncoding.EncodeToString(public),
		base64.StdEncoding.EncodeToString(public),
	} {
		got, err := ParsePublicKey(encoded)
		if err != nil || !got.Equal(public) {
			t.Fatalf("ParsePublicKey(%q) = %v, %v", encoded, got, err)
		}
	}
	for _, bad := range []string{"%%%", base64.RawURLEncoding.EncodeToString([]byte("short"))} {
		if _, err := ParsePublicKey(bad); err == nil {
			t.Fatalf("ParsePublicKey(%q) accepted", bad)
		}
	}
}

func TestVerify(t *testing.T) {
	public, private := keys(t)
	_, otherPrivate := keys(t)
	verifier := NewVerifier(public, func() time.Time { return now })

	principal, err := verifier.Verify(sign(t, private, valid()))
	if err != nil {
		t.Fatal(err)
	}
	if principal.UserID != "u1" || principal.SessionID != "s1" || !principal.IsAdmin() ||
		len(principal.Groups) != 1 {
		t.Fatalf("unexpected principal %+v", principal)
	}

	tooLong := valid()
	tooLong.lifetime = time.Hour
	wrongIssuer := valid()
	wrongIssuer.issuer = "someone"
	wrongAudience := valid()
	wrongAudience.audience = "other"
	noSubject := valid()
	noSubject.subject = ""
	expired := valid()
	expired.lifetime = -time.Hour
	hmac := valid()
	hmac.method = jwt.SigningMethodHS256

	cases := map[string]string{
		"lifetime over 5 min": sign(t, private, tooLong),
		"wrong issuer":        sign(t, private, wrongIssuer),
		"wrong audience":      sign(t, private, wrongAudience),
		"no subject":          sign(t, private, noSubject),
		"expired":             sign(t, private, expired),
		"other key":           sign(t, otherPrivate, valid()),
		"HMAC algorithm":      sign(t, private, hmac),
		"garbage":             "not.a.token",
	}
	for name, token := range cases {
		if _, err := verifier.Verify(token); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s: want ErrInvalid, got %v", name, err)
		}
	}
}

func TestMiddleware(t *testing.T) {
	public, private := keys(t)
	verifier := NewVerifier(public, func() time.Time { return now })
	var seen Principal
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen, _ = FromContext(r.Context())
		w.WriteHeader(http.StatusNoContent)
	})
	var gotCode string
	fail := func(w http.ResponseWriter, _ *http.Request, status int, code string) {
		gotCode = code
		w.WriteHeader(status)
	}

	cases := []struct {
		name     string
		verifier *Verifier
		header   string
		status   int
		code     string
	}{
		{"no key configured", nil, "", http.StatusServiceUnavailable, CodeUnavailable},
		{"no header", verifier, "", http.StatusUnauthorized, CodeMissing},
		{"not bearer", verifier, "Basic abc", http.StatusUnauthorized, CodeMissing},
		{"invalid", verifier, "Bearer nope", http.StatusUnauthorized, CodeInvalid},
		{"valid", verifier, "Bearer " + sign(t, private, valid()), http.StatusNoContent, ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			gotCode = ""
			request := httptest.NewRequest(http.MethodGet, "/v1/fs", nil)
			if tc.header != "" {
				request.Header.Set("Authorization", tc.header)
			}
			recorder := httptest.NewRecorder()
			Middleware(tc.verifier, fail)(next).ServeHTTP(recorder, request)
			if recorder.Code != tc.status || gotCode != tc.code {
				t.Fatalf("got %d %q, want %d %q", recorder.Code, gotCode, tc.status, tc.code)
			}
		})
	}
	if seen.UserID != "u1" {
		t.Fatalf("principal not passed on: %+v", seen)
	}
	if _, ok := FromContext(httptest.NewRequest(http.MethodGet, "/", nil).Context()); ok {
		t.Fatal("empty context returned a principal")
	}
}
