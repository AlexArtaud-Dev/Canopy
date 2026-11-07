// Package logging builds the engine's structured logger and request-scoped logging middleware.
package logging

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5/middleware"
)

// New returns a JSON logger tagged with the engine module so web and engine logs can be merged.
func New(w io.Writer, level slog.Level) *slog.Logger {
	handler := slog.NewJSONHandler(w, &slog.HandlerOptions{Level: level})
	return slog.New(handler).With(slog.String("module", "engine"))
}

type loggerKey struct{}

// FromContext returns the request logger, falling back to the given base logger.
func FromContext(ctx context.Context, base *slog.Logger) *slog.Logger {
	if logger, ok := ctx.Value(loggerKey{}).(*slog.Logger); ok {
		return logger
	}
	return base
}

// Middleware attaches a logger carrying the request id and logs one line per request.
// It must run after chi's RequestID middleware.
func Middleware(base *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			logger := base.With(slog.String("requestId", middleware.GetReqID(r.Context())))
			ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)

			next.ServeHTTP(ww, r.WithContext(context.WithValue(r.Context(), loggerKey{}, logger)))

			logger.LogAttrs(r.Context(), slog.LevelInfo, "http request",
				slog.String("method", r.Method),
				slog.String("route", r.URL.Path),
				slog.Int("status", ww.Status()),
				slog.Int("bytes", ww.BytesWritten()),
				slog.Duration("duration", time.Since(start)),
			)
		})
	}
}
