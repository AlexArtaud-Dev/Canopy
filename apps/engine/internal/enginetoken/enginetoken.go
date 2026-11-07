// Package enginetoken verifies the short-lived Ed25519 tokens the web app signs for each request
// to the engine, and carries the resulting principal through the request context.
package enginetoken

import (
	"context"
	"crypto/ed25519"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const (
	issuer   = "canopy-web"
	audience = "canopy-engine"
	// maxLifetime caps tokens even if the web app asked for more.
	maxLifetime = 5 * time.Minute
	leeway      = 30 * time.Second
	// AdminPermission bypasses path grants (still audited).
	AdminPermission = "system:admin"
)

// Error codes returned to the web app (translated there).
const (
	CodeMissing     = "auth.engine_token_missing"
	CodeInvalid     = "auth.engine_token_invalid"
	CodeUnavailable = "system.engine_key_missing"
)

// ErrInvalid is returned for any token that must not be trusted.
var ErrInvalid = errors.New("invalid engine token")

// Principal is the authenticated caller of an engine request.
type Principal struct {
	UserID      string
	SessionID   string
	Permissions []string
	Groups      []string
}

// IsAdmin reports whether the principal bypasses path grants.
func (p Principal) IsAdmin() bool {
	return slices.Contains(p.Permissions, AdminPermission)
}

type claims struct {
	SessionID   string   `json:"sid"`
	Permissions []string `json:"perms"`
	Groups      []string `json:"groups"`
	jwt.RegisteredClaims
}

// ParsePublicKey decodes the base64url (or base64) raw 32-byte Ed25519 public key.
func ParsePublicKey(encoded string) (ed25519.PublicKey, error) {
	trimmed := strings.TrimRight(strings.TrimSpace(encoded), "=")
	raw, err := base64.RawURLEncoding.DecodeString(trimmed)
	if err != nil {
		raw, err = base64.RawStdEncoding.DecodeString(trimmed)
	}
	if err != nil {
		return nil, fmt.Errorf("decode public key: %w", err)
	}
	if len(raw) != ed25519.PublicKeySize {
		return nil, fmt.Errorf("public key: want %d bytes, got %d", ed25519.PublicKeySize, len(raw))
	}
	return ed25519.PublicKey(raw), nil
}

// Verifier checks tokens against the web app's public key.
type Verifier struct {
	key ed25519.PublicKey
	now func() time.Time
}

// NewVerifier builds a verifier; now is injectable for tests.
func NewVerifier(key ed25519.PublicKey, now func() time.Time) *Verifier {
	return &Verifier{key: key, now: now}
}

// Verify returns the principal of a valid token, or ErrInvalid.
func (v *Verifier) Verify(token string) (Principal, error) {
	parsed := claims{}
	_, err := jwt.ParseWithClaims(token, &parsed, func(*jwt.Token) (any, error) { return v.key, nil },
		jwt.WithValidMethods([]string{jwt.SigningMethodEdDSA.Alg()}),
		jwt.WithIssuer(issuer),
		jwt.WithAudience(audience),
		jwt.WithExpirationRequired(),
		jwt.WithIssuedAt(),
		jwt.WithLeeway(leeway),
		jwt.WithTimeFunc(v.now),
	)
	if err != nil {
		return Principal{}, fmt.Errorf("%w: %w", ErrInvalid, err)
	}
	if parsed.Subject == "" || parsed.IssuedAt == nil ||
		parsed.ExpiresAt.Sub(parsed.IssuedAt.Time) > maxLifetime {
		return Principal{}, ErrInvalid
	}
	return Principal{
		UserID:      parsed.Subject,
		SessionID:   parsed.SessionID,
		Permissions: parsed.Permissions,
		Groups:      parsed.Groups,
	}, nil
}

type contextKey struct{}

// WithPrincipal stores the principal in the context.
func WithPrincipal(ctx context.Context, principal Principal) context.Context {
	return context.WithValue(ctx, contextKey{}, principal)
}

// FromContext returns the principal of an authenticated request.
func FromContext(ctx context.Context) (Principal, bool) {
	principal, ok := ctx.Value(contextKey{}).(Principal)
	return principal, ok
}

// ErrorWriter answers a rejected request with a status and an error code.
type ErrorWriter func(w http.ResponseWriter, r *http.Request, status int, code string)

// Middleware requires a valid bearer token. A nil verifier (no key configured) refuses every
// request rather than letting it through.
func Middleware(verifier *Verifier, fail ErrorWriter) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if verifier == nil {
				fail(w, r, http.StatusServiceUnavailable, CodeUnavailable)
				return
			}
			token, found := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
			if !found || token == "" {
				fail(w, r, http.StatusUnauthorized, CodeMissing)
				return
			}
			principal, err := verifier.Verify(token)
			if err != nil {
				fail(w, r, http.StatusUnauthorized, CodeInvalid)
				return
			}
			next.ServeHTTP(w, r.WithContext(WithPrincipal(r.Context(), principal)))
		})
	}
}
