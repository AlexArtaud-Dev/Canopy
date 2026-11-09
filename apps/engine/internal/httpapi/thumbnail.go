package httpapi

import (
	"context"
	"errors"
	"net/http"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/enginetoken"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/fsx"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/thumbs"
)

// Thumbnails renders and caches small previews.
type Thumbnails interface {
	Current(ctx context.Context) thumbs.Settings
	Available(settings thumbs.Settings, name string, size int64) bool
	Thumbnail(ctx context.Context, virtual string) ([]byte, string, error)
}

// codeNoThumbnail: thumbnails are off, or this file cannot have one; the UI keeps the icon.
const codeNoThumbnail = "files.no_thumbnail"

// thumbnailCacheControl lets the browser keep a thumbnail for a day: its URL carries the file's
// modification time, so a changed file is fetched again.
const thumbnailCacheControl = "private, max-age=86400"

// thumbnail serves a rendered thumbnail. It shows the content, so it needs `download` like a
// preview; it changes nothing, so it is not audited (a grid asks for dozens at once).
func (s *server) thumbnail(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	principal, ok := enginetoken.FromContext(ctx)
	if !ok {
		errorHandler(s.deps.Logger, http.StatusUnauthorized, codeUnauthorized)(w, r, errors.New(codeUnauthorized))
		return
	}
	if s.deps.Thumbs == nil {
		s.refuse(w, r, thumbs.ErrDisabled)
		return
	}
	clean, err := fsx.Clean(r.URL.Query().Get("path"))
	if err != nil {
		s.refuse(w, r, err)
		return
	}
	access, err := s.accessOf(ctx, principal)
	if err != nil {
		s.refuse(w, r, err)
		return
	}
	if !access.Can("download", clean) {
		s.refuse(w, r, errForbidden)
		return
	}
	data, key, err := s.deps.Thumbs.Thumbnail(ctx, clean)
	if errors.Is(err, fsx.ErrNotRegular) {
		err = thumbs.ErrUnsupported
	}
	if err != nil {
		s.refuse(w, r, err)
		return
	}
	etag := `"` + key + `"`
	header := w.Header()
	header.Set("ETag", etag)
	header.Set("Cache-Control", thumbnailCacheControl)
	header.Set("X-Content-Type-Options", "nosniff")
	header.Set("Content-Security-Policy", sandboxPolicy)
	if r.Header.Get("If-None-Match") == etag {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	header.Set("Content-Type", http.DetectContentType(data))
	// Bytes the engine encoded itself (JPEG or PNG), with nosniff and a sandbox policy.
	_, _ = w.Write(data) //nolint:gosec // not user markup
}
