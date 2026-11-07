// Package httpapi exposes the engine over HTTP. Handlers will implement the interfaces generated
// from packages/contracts; until then only operational endpoints live here.
package httpapi

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/logging"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/spike"
)

const readinessTimeout = 2 * time.Second

// Pinger reports whether a dependency (the database) is reachable.
type Pinger interface {
	Ping(ctx context.Context) error
}

// Deps are the collaborators the router needs; injected so handlers stay testable.
type Deps struct {
	Logger   *slog.Logger
	Database Pinger
}

// NewRouter builds the HTTP handler tree.
func NewRouter(deps Deps) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(logging.Middleware(deps.Logger))
	r.Use(middleware.Recoverer)

	r.Get("/healthz", handleLiveness)
	r.Get("/readyz", handleReadiness(deps))
	r.Mount("/spike", spike.Routes(deps.Logger))

	return r
}

type statusResponse struct {
	Status string `json:"status"`
}

// errorResponse mirrors the shared error model: a stable code the UI translates, never a message.
type errorResponse struct {
	Code      string         `json:"code"`
	Params    map[string]any `json:"params"`
	RequestID string         `json:"requestId"`
}

func handleLiveness(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, statusResponse{Status: "ok"})
}

func handleReadiness(deps Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), readinessTimeout)
		defer cancel()

		if err := deps.Database.Ping(ctx); err != nil {
			logging.FromContext(r.Context(), deps.Logger).Warn("database not ready", slog.Any("error", err))
			writeError(w, r, http.StatusServiceUnavailable, "system.database_unavailable")
			return
		}
		writeJSON(w, http.StatusOK, statusResponse{Status: "ready"})
	}
}

func writeError(w http.ResponseWriter, r *http.Request, status int, code string) {
	writeJSON(w, status, errorResponse{
		Code:      code,
		Params:    map[string]any{},
		RequestID: middleware.GetReqID(r.Context()),
	})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	// The status line is already sent; an encoding failure can only mean the client went away.
	_ = json.NewEncoder(w).Encode(body)
}
