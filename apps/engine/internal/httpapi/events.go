package httpapi

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/enginetoken"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/logging"
)

// heartbeatInterval keeps idle streams alive through proxies that drop silent connections.
const heartbeatInterval = 25 * time.Second

// jobEvents streams job changes as Server-Sent Events (`event: job`, data is a Job). Not part of
// the generated strict server: event streams need to flush as they go.
func (s *server) jobEvents(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	principal, ok := enginetoken.FromContext(ctx)
	if !ok {
		errorHandler(s.deps.Logger, http.StatusUnauthorized, codeUnauthorized)(w, r, fmt.Errorf("%s", codeUnauthorized))
		return
	}
	logger := logging.FromContext(ctx, s.deps.Logger)
	owner := ownerScope(principal)
	notices, unsubscribe := s.deps.Jobs.Subscribe(owner)
	defer unsubscribe()

	header := w.Header()
	header.Set("Content-Type", "text/event-stream")
	header.Set("Cache-Control", "no-cache")
	header.Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	controller := http.NewResponseController(w)
	send := func(chunk string) bool {
		if _, err := fmt.Fprint(w, chunk); err != nil {
			return false
		}
		return controller.Flush() == nil
	}
	if !send(": connected\n\n") {
		return
	}

	heartbeat := time.NewTicker(heartbeatInterval)
	defer heartbeat.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-s.deps.StreamsDone:
			return
		case <-heartbeat.C:
			if !send(": ping\n\n") {
				return
			}
		case notice := <-notices:
			job, err := s.deps.Jobs.Get(ctx, notice.ID, owner)
			if err != nil {
				logger.Warn("job event skipped", slog.String("jobId", notice.ID), slog.Any("error", err))
				continue
			}
			body, err := toAPIJob(job)
			if err != nil {
				continue
			}
			data, err := json.Marshal(body)
			if err != nil || !send("event: job\ndata: "+string(data)+"\n\n") {
				return
			}
		}
	}
}
