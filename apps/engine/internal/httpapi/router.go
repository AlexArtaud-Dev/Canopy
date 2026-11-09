// Package httpapi exposes the engine over HTTP by implementing the strict server interface
// generated from packages/contracts/openapi.yaml.
package httpapi

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/api"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/enginetoken"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/logging"
)

const (
	readinessTimeout = 2 * time.Second

	codeDatabaseUnavailable = "system.database_unavailable"
	codeBadRequest          = "system.bad_request"
	codeInternal            = "system.internal"
)

// Pinger reports whether a dependency (the database) is reachable.
type Pinger interface {
	Ping(ctx context.Context) error
}

// Deps are the collaborators the router needs; injected so handlers stay testable.
type Deps struct {
	Logger   *slog.Logger
	Database Pinger
	Files    Files
	Ops      Ops
	Grants   Grants
	// Verifier checks engine tokens; nil refuses every /v1 request (no key configured).
	Verifier *enginetoken.Verifier
	Jobs     Jobs
	Trash    Trash
	Audit    Auditor
	// Uploads is the tus endpoint (nil disables uploads, e.g. in tests).
	Uploads http.Handler
	// StreamsDone closes when the server shuts down, ending event streams that would otherwise
	// hold the shutdown open.
	StreamsDone <-chan struct{}
}

// NewRouter builds the HTTP handler tree.
func NewRouter(deps Deps) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(logging.Middleware(deps.Logger))
	r.Use(middleware.Recoverer)
	r.Use(requireToken(deps.Verifier, deps.Logger))

	srv := &server{deps: deps}
	r.Get("/v1/jobs/events", srv.jobEvents)
	r.Get(routeDownload, srv.download)
	r.Head(routeDownload, srv.download)
	r.Get(routePreview, srv.preview)
	r.Head(routePreview, srv.preview)
	r.Get(routeArchive, srv.archive)
	if deps.Uploads != nil {
		r.Handle(routeUploads+"*", deps.Uploads)
	}
	strict := api.NewStrictHandlerWithOptions(srv, nil, api.StrictHTTPServerOptions{
		RequestErrorHandlerFunc:  errorHandler(deps.Logger, http.StatusBadRequest, codeBadRequest),
		ResponseErrorHandlerFunc: errorHandler(deps.Logger, http.StatusInternalServerError, codeInternal),
	})
	return api.HandlerFromMux(strict, r)
}

type server struct {
	deps Deps
}

var _ api.StrictServerInterface = (*server)(nil)

func (s *server) GetLiveness(context.Context, api.GetLivenessRequestObject) (api.GetLivenessResponseObject, error) {
	return api.GetLiveness200JSONResponse{Status: api.Ok}, nil
}

func (s *server) GetReadiness(ctx context.Context, _ api.GetReadinessRequestObject) (api.GetReadinessResponseObject, error) {
	pingCtx, cancel := context.WithTimeout(ctx, readinessTimeout)
	defer cancel()

	if err := s.deps.Database.Ping(pingCtx); err != nil {
		logging.FromContext(ctx, s.deps.Logger).Warn("database not ready", slog.Any("error", err))
		return api.GetReadiness503JSONResponse(newError(ctx, codeDatabaseUnavailable)), nil
	}
	return api.GetReadiness200JSONResponse{Status: api.Ready}, nil
}

// newError builds the shared error model: a stable code the UI translates, never a message.
func newError(ctx context.Context, code string) api.Error {
	return api.Error{Code: code, Params: map[string]any{}, RequestId: middleware.GetReqID(ctx)}
}

func errorHandler(logger *slog.Logger, status int, code string) func(http.ResponseWriter, *http.Request, error) {
	return func(w http.ResponseWriter, r *http.Request, err error) {
		logging.FromContext(r.Context(), logger).Error("request failed", slog.String("code", code), slog.Any("error", err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		// The status line is already sent; an encoding failure can only mean the client went away.
		_ = json.NewEncoder(w).Encode(newError(r.Context(), code))
	}
}
