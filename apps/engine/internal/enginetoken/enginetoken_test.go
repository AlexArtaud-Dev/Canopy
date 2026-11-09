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
	scope, share, mode, id    string
	upload                    *UploadGrant
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
		Scope:       opts.scope,
		Share:       opts.share,
		Mode:        opts.mode,
		Upload:      opts.upload,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    opts.issuer,
			Audience:  jwt.ClaimStrings{opts.audience},
			Subject:   opts.subject,
			ID:        opts.id,
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
		{"stream ticket off a stream route", verifier, "Bearer " + sign(t, private, stream()), http.StatusForbidden, CodeInvalid},
		{"stream ticket on a stream route", verifier, "Bearer " + sign(t, private, stream()), http.StatusNoContent, ""},
		{"unknown audience", verifier, "Bearer " + sign(t, private, otherAudience()), http.StatusUnauthorized, CodeInvalid},
		{"share token off its routes", verifier, "Bearer " + sign(t, private, shared("/media", "s1")), http.StatusForbidden, CodeInvalid},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			gotCode = ""
			target := "/v1/fs"
			if tc.name == "stream ticket on a stream route" {
				target = "/v1/stream"
			}
			request := httptest.NewRequest(http.MethodGet, target, nil)
			if tc.header != "" {
				request.Header.Set("Authorization", tc.header)
			}
			recorder := httptest.NewRecorder()
			streamRoute := func(r *http.Request) bool { return r.URL.Path == "/v1/stream" }
			scopedRoute := func(r *http.Request, _ Principal) bool { return r.URL.Path == "/v1/stream" }
			Middleware(tc.verifier, fail, streamRoute, scopedRoute)(next).ServeHTTP(recorder, request)
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

func stream() tokenOptions {
	opts := valid()
	opts.audience = StreamAudience
	return opts
}

func otherAudience() tokenOptions {
	opts := valid()
	opts.audience = "someone-else"
	return opts
}

func shared(scope, share string) tokenOptions {
	opts := valid()
	opts.scope, opts.share = scope, share
	return opts
}

func TestVerifyScope(t *testing.T) {
	public, private := keys(t)
	verifier := NewVerifier(public, func() time.Time { return now })
	principal, err := verifier.Verify(sign(t, private, shared("/media/../media/photos/", "s1")))
	if err != nil || principal.Scope != "/media/photos" || principal.Share != "s1" {
		t.Fatalf("scoped: %+v %v", principal, err)
	}
	for _, opts := range []tokenOptions{shared("relative", "s1"), shared("/media", "")} {
		if _, err := verifier.Verify(sign(t, private, opts)); !errors.Is(err, ErrInvalid) {
			t.Fatalf("%+v accepted", opts)
		}
	}
}

func TestVerifyUploadLink(t *testing.T) {
	public, private := keys(t)
	verifier := NewVerifier(public, func() time.Time { return now })
	opts := shared("/inbox", "s2")
	opts.mode, opts.id, opts.upload = ModeUpload, "ticket-1", &UploadGrant{Name: "a.pdf", Size: 10}
	principal, err := verifier.Verify(sign(t, private, opts))
	if err != nil || principal.Mode != ModeUpload || principal.TicketID != "ticket-1" || principal.Upload.Name != "a.pdf" {
		t.Fatalf("upload link: %+v %v", principal, err)
	}
	subject := principal.Subject()
	if subject.Scope != "/inbox" || subject.Mode != ModeUpload || subject.UserID != "u1" {
		t.Fatalf("subject: %+v", subject)
	}
	opts.mode = "delete"
	if _, err := verifier.Verify(sign(t, private, opts)); !errors.Is(err, ErrInvalid) {
		t.Fatal("unknown mode")
	}
	read, _ := verifier.Verify(sign(t, private, shared("/media", "s1")))
	if read.Mode != ModeRead {
		t.Fatalf("download links read: %q", read.Mode)
	}
}
