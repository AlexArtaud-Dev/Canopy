package disks

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
)

// Reader is what the disks service offers: smartctl, behind HTTP.
type Reader interface {
	List(ctx context.Context) ([]Disk, error)
	Get(ctx context.Context, id string) (Disk, error)
	StartTest(ctx context.Context, id string, kind TestKind) error
	AbortTest(ctx context.Context, id string) error
}

// List is the disks service's answer to a listing.
type List struct {
	Disks []Disk `json:"disks"`
}

// testRequest asks for a self-test.
type testRequest struct {
	Kind TestKind `json:"kind"`
}

// maxRequestBytes bounds what the service reads from a request.
const maxRequestBytes = 1 << 10

// Handler serves the disks service on the internal network: the engine is its only client,
// identified by a shared token. It answers nothing else (no files, no shell).
func Handler(reader Reader, token string, logger *slog.Logger) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})
	mux.HandleFunc("GET /v1/disks", func(w http.ResponseWriter, r *http.Request) {
		disks, err := reader.List(r.Context())
		if err != nil {
			fail(w, logger, err)
			return
		}
		reply(w, http.StatusOK, List{Disks: disks})
	})
	mux.HandleFunc("GET /v1/disks/{id}", func(w http.ResponseWriter, r *http.Request) {
		disk, err := reader.Get(r.Context(), r.PathValue("id"))
		if err != nil {
			fail(w, logger, err)
			return
		}
		reply(w, http.StatusOK, disk)
	})
	mux.HandleFunc("POST /v1/disks/{id}/self-test", func(w http.ResponseWriter, r *http.Request) {
		var request testRequest
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxRequestBytes)).Decode(&request); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		if err := reader.StartTest(r.Context(), r.PathValue("id"), request.Kind); err != nil {
			fail(w, logger, err)
			return
		}
		w.WriteHeader(http.StatusAccepted)
	})
	mux.HandleFunc("DELETE /v1/disks/{id}/self-test", func(w http.ResponseWriter, r *http.Request) {
		if err := reader.AbortTest(r.Context(), r.PathValue("id")); err != nil {
			fail(w, logger, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
	return authorized(token, mux)
}

func authorized(token string, next http.Handler) http.Handler {
	expected := []byte("Bearer " + token)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/healthz" &&
			(token == "" || subtle.ConstantTimeCompare([]byte(r.Header.Get("Authorization")), expected) != 1) {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func reply(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func fail(w http.ResponseWriter, logger *slog.Logger, err error) {
	switch {
	case errors.Is(err, ErrUnknownDisk):
		w.WriteHeader(http.StatusNotFound)
	case errors.Is(err, ErrUnknownTest):
		w.WriteHeader(http.StatusBadRequest)
	default:
		logger.Error("disks: smartctl failed", slog.String("error", strings.TrimSpace(err.Error())))
		w.WriteHeader(http.StatusBadGateway)
	}
}
