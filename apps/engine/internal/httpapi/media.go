package httpapi

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path"
	"strings"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/api"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/enginetoken"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/fsx"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/logging"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/media"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/preview"
)

// routeStream serves a video converted on the fly (fragmented MP4) for browsers that cannot play
// the stored file. Like the preview, it needs the `download` right.
const routeStream = "/v1/fs/stream"

// Media probes and converts videos (nil when ffmpeg is not installed).
type Media interface {
	Probe(ctx context.Context, file *os.File) (media.Info, error)
	Stream(ctx context.Context, file *os.File, info media.Info, start float64, out io.Writer) error
}

var (
	errNoStream     = errors.New("no ffmpeg on this engine")
	errInvalidStart = errors.New("invalid start")
)

// Codes of the stream route.
const (
	codeNoStream     = "media.unavailable"
	codeInvalidStart = "media.invalid_start"
)

// openVideo opens a video the caller may download.
func (s *server) openVideo(ctx context.Context, principal enginetoken.Principal, raw string) (*os.File, string, error) {
	clean, err := fsx.Clean(raw)
	if err != nil {
		return nil, "", err //nolint:wrapcheck // classified by the caller
	}
	if kind, _ := preview.Classify(clean); kind != preview.Video {
		return nil, "", errNoPreview
	}
	access, err := s.accessOf(ctx, principal)
	if err != nil {
		return nil, "", err
	}
	if !access.Can("download", clean) {
		return nil, "", errForbidden
	}
	file, _, err := s.deps.Ops.OpenFile(clean)
	if errors.Is(err, fsx.ErrNotRegular) {
		return nil, "", fsx.ErrNotFound
	}
	if err != nil {
		return nil, "", err //nolint:wrapcheck // classified by the caller
	}
	return file, clean, nil
}

func mediaRefusal(ctx context.Context, err error) (api.GetMediaInfoResponseObject, bool) {
	refusal, known := classify(err)
	if !known {
		return nil, false
	}
	body := newError(ctx, refusal.code)
	switch refusal.status {
	case http.StatusForbidden:
		return api.GetMediaInfo403JSONResponse(body), true
	case http.StatusNotFound:
		return api.GetMediaInfo404JSONResponse(body), true
	default:
		return api.GetMediaInfo400JSONResponse(body), true
	}
}

// GetMediaInfo tells the web app how to play a video: as stored, or converted by the engine.
func (s *server) GetMediaInfo(ctx context.Context, request api.GetMediaInfoRequestObject) (api.GetMediaInfoResponseObject, error) {
	principal, ok := enginetoken.FromContext(ctx)
	if !ok {
		return api.GetMediaInfo401JSONResponse(newError(ctx, codeUnauthorized)), nil
	}
	file, clean, err := s.openVideo(ctx, principal, request.Params.Path)
	if err != nil {
		if refusal, known := mediaRefusal(ctx, err); known {
			return refusal, nil
		}
		return nil, err
	}
	defer func() { _ = file.Close() }()
	if s.deps.Media == nil {
		return api.GetMediaInfo200JSONResponse{Mode: api.Direct, Streamable: false}, nil
	}
	info, err := s.deps.Media.Probe(ctx, file)
	if errors.Is(err, media.ErrUnreadable) {
		return api.GetMediaInfo400JSONResponse(newError(ctx, media.CodeUnreadable)), nil
	}
	if err != nil {
		return nil, err //nolint:wrapcheck // answered as system.internal
	}
	body := api.GetMediaInfo200JSONResponse{
		Mode:       api.MediaInfoMode(media.Choose(info, strings.ToLower(path.Ext(clean)))),
		Streamable: true, Duration: float32(info.Duration),
		Video: &info.Video, Width: &info.Width, Height: &info.Height,
	}
	if info.Audio != "" {
		body.Audio = &info.Audio
	}
	return body, nil
}

// stream converts a video for the browser from `start` seconds. Only the first request (from the
// start) is audited; seeking starts a new conversion.
func (s *server) stream(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	principal, ok := enginetoken.FromContext(ctx)
	if !ok {
		errorHandler(s.deps.Logger, http.StatusUnauthorized, codeUnauthorized)(w, r, errors.New(codeUnauthorized))
		return
	}
	if s.deps.Media == nil {
		s.refuse(w, r, errNoStream)
		return
	}
	file, clean, err := s.openVideo(ctx, principal, r.URL.Query().Get("path"))
	if err != nil {
		s.refuse(w, r, err)
		return
	}
	defer func() { _ = file.Close() }()
	info, err := s.deps.Media.Probe(ctx, file)
	if err != nil {
		s.refuse(w, r, err)
		return
	}
	start, err := media.ParseStart(r.URL.Query().Get("start"), info.Duration)
	if err != nil {
		s.refuse(w, r, errors.Join(errInvalidStart, err))
		return
	}
	if start == 0 {
		s.record(ctx, principal, "fs.preview", clean, map[string]any{"converted": true})
	}
	header := w.Header()
	header.Set("Content-Type", "video/mp4")
	header.Set("Cache-Control", "private, no-store")
	header.Set("X-Content-Type-Options", "nosniff")
	header.Set("Content-Security-Policy", "frame-ancestors 'self'")
	err = s.deps.Media.Stream(ctx, file, info, start, w)
	if errors.Is(err, media.ErrBusy) {
		s.refuse(w, r, err)
		return
	}
	if err != nil {
		// The response has started: the player just stops.
		logging.FromContext(ctx, s.deps.Logger).Warn("video stream stopped", slog.String("path", clean), slog.Any("error", err))
	}
}
