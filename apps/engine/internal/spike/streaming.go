// Package spike holds throwaway endpoints used to measure streaming through the web proxy.
// It is never merged: only the findings are kept (docs/dev/streaming.md).
package spike

import (
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"sync/atomic"
	"time"

	"github.com/go-chi/chi/v5"
)

// Live counters let the harness verify that client aborts propagate to the engine.
var (
	activeStreams atomic.Int64
	abortedSinks  atomic.Int64
)

// Routes mounts the spike endpoints.
func Routes(logger *slog.Logger) http.Handler {
	r := chi.NewRouter()
	r.Get("/stats", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = fmt.Fprintf(w, `{"activeStreams":%d,"abortedSinks":%d}`, activeStreams.Load(), abortedSinks.Load())
	})
	r.Put("/sink", handleSink(logger))
	r.Get("/blob", handleBlob)
	r.Get("/sse", handleSSE(logger))
	return r
}

// handleSink consumes an upload and reports what arrived; aborts are logged with the byte count.
func handleSink(logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		activeStreams.Add(1)
		defer activeStreams.Add(-1)
		start := time.Now()
		n, err := io.Copy(io.Discard, r.Body)
		elapsed := time.Since(start)
		if err != nil {
			abortedSinks.Add(1)
			logger.Warn("spike sink aborted", slog.Int64("bytes", n), slog.Duration("after", elapsed), slog.Any("error", err))
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = fmt.Fprintf(w, `{"bytes":%d,"seconds":%.3f}`, n, elapsed.Seconds())
	}
}

// zeroReader is a seekable stream of zero bytes of a fixed size, so ServeContent can honor Range.
type zeroReader struct {
	size, offset int64
}

func (z *zeroReader) Read(p []byte) (int, error) {
	if z.offset >= z.size {
		return 0, io.EOF
	}
	n := min(int64(len(p)), z.size-z.offset)
	clear(p[:n])
	z.offset += n
	return int(n), nil
}

func (z *zeroReader) Seek(offset int64, whence int) (int64, error) {
	switch whence {
	case io.SeekStart:
		z.offset = offset
	case io.SeekCurrent:
		z.offset += offset
	case io.SeekEnd:
		z.offset = z.size + offset
	default:
		return 0, errors.New("invalid whence")
	}
	return z.offset, nil
}

func handleBlob(w http.ResponseWriter, r *http.Request) {
	size, err := strconv.ParseInt(r.URL.Query().Get("size"), 10, 64)
	if err != nil || size < 0 {
		http.Error(w, "size required", http.StatusBadRequest)
		return
	}
	activeStreams.Add(1)
	defer activeStreams.Add(-1)
	w.Header().Set("Content-Type", "application/octet-stream")
	http.ServeContent(w, r, "blob.bin", time.Time{}, &zeroReader{size: size})
}

// handleSSE emits one event per second and a heartbeat comment every 15 s until the client leaves.
func handleSSE(logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "streaming unsupported", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache, no-transform")
		w.Header().Set("X-Accel-Buffering", "no")
		w.WriteHeader(http.StatusOK)
		flusher.Flush()
		activeStreams.Add(1)
		defer activeStreams.Add(-1)

		start := time.Now()
		tick := time.NewTicker(time.Second)
		heartbeat := time.NewTicker(15 * time.Second)
		defer tick.Stop()
		defer heartbeat.Stop()

		for seq := 0; ; {
			select {
			case <-r.Context().Done():
				logger.Info("spike sse closed by client", slog.Int("events", seq), slog.Duration("after", time.Since(start)))
				return
			case now := <-tick.C:
				seq++
				_, _ = fmt.Fprintf(w, "id: %d\ndata: {\"seq\":%d,\"sentAt\":%d}\n\n", seq, seq, now.UnixMilli())
				flusher.Flush()
			case <-heartbeat.C:
				_, _ = io.WriteString(w, ": heartbeat\n\n")
				flusher.Flush()
			}
		}
	}
}
