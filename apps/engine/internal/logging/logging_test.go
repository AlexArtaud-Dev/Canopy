package logging

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5/middleware"
)

func TestMiddlewareLogsRequestWithID(t *testing.T) {
	t.Parallel()

	var buf bytes.Buffer
	base := New(&buf, slog.LevelInfo)

	var seen *slog.Logger
	handler := middleware.RequestID(Middleware(base)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = FromContext(r.Context(), nil)
		w.WriteHeader(http.StatusTeapot)
	})))

	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	req.Header.Set(middleware.RequestIDHeader, "req-123")
	handler.ServeHTTP(httptest.NewRecorder(), req)

	if seen == nil || seen == base {
		t.Fatal("handler did not receive a request-scoped logger")
	}

	var line map[string]any
	if err := json.Unmarshal(buf.Bytes(), &line); err != nil {
		t.Fatalf("log line is not JSON: %v", err)
	}
	checks := map[string]any{"module": "engine", "requestId": "req-123", "route": "/healthz", "status": float64(http.StatusTeapot)}
	for key, want := range checks {
		if line[key] != want {
			t.Errorf("log %s = %v, want %v", key, line[key], want)
		}
	}
}

func TestFromContextFallsBack(t *testing.T) {
	t.Parallel()

	base := New(&bytes.Buffer{}, slog.LevelInfo)
	if got := FromContext(context.Background(), base); got != base {
		t.Fatal("FromContext should return the base logger when none is attached")
	}
}
