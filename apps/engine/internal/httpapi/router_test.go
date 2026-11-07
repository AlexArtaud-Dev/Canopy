package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/logging"
)

type pingerFunc func(ctx context.Context) error

func (f pingerFunc) Ping(ctx context.Context) error { return f(ctx) }

func newTestRouter(ping pingerFunc) http.Handler {
	return NewRouter(Deps{Logger: logging.New(&bytes.Buffer{}, slog.LevelInfo), Database: ping})
}

func TestHealthEndpoints(t *testing.T) {
	t.Parallel()

	healthy := pingerFunc(func(context.Context) error { return nil })
	down := pingerFunc(func(context.Context) error { return errors.New("connection refused") })

	tests := []struct {
		name       string
		pinger     pingerFunc
		path       string
		wantStatus int
		wantField  string
		wantValue  string
	}{
		{"liveness ignores database", down, "/healthz", http.StatusOK, "status", "ok"},
		{"readiness with database", healthy, "/readyz", http.StatusOK, "status", "ready"},
		{"readiness without database", down, "/readyz", http.StatusServiceUnavailable, "code", "system.database_unavailable"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			rec := httptest.NewRecorder()
			newTestRouter(tt.pinger).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, tt.path, nil))

			if rec.Code != tt.wantStatus {
				t.Fatalf("status = %d, want %d", rec.Code, tt.wantStatus)
			}
			if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
				t.Fatalf("Content-Type = %q", ct)
			}
			var body map[string]any
			if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
				t.Fatalf("invalid JSON: %v", err)
			}
			if body[tt.wantField] != tt.wantValue {
				t.Fatalf("%s = %v, want %v", tt.wantField, body[tt.wantField], tt.wantValue)
			}
		})
	}
}

func TestErrorResponseCarriesRequestID(t *testing.T) {
	t.Parallel()

	down := pingerFunc(func(context.Context) error { return errors.New("down") })
	rec := httptest.NewRecorder()
	newTestRouter(down).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/readyz", nil))

	var body errorResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if body.RequestID == "" {
		t.Fatal("requestId must be set on errors")
	}
}
