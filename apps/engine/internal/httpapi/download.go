package httpapi

import (
	"archive/zip"
	"context"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log/slog"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/enginetoken"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/fsx"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/logging"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/preview"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/transfer"
)

// Streaming routes: plain handlers (Range requests and archives cannot go through the generated
// strict server). Stream tickets are accepted here and nowhere else.
const (
	routeDownload = "/v1/fs/download"
	routePreview  = "/v1/fs/preview"
	routeArchive  = "/v1/fs/archive"
	routeUploads  = "/v1/uploads/"
	maxArchived   = 1000
)

// isStreamRoute tells the token middleware where stream tickets may be used.
func isStreamRoute(r *http.Request) bool {
	return r.URL.Path == routeDownload || r.URL.Path == routePreview || r.URL.Path == routeArchive ||
		strings.HasPrefix(r.URL.Path, routeUploads)
}

// ContentDisposition names a download safely: an ASCII fallback plus the exact UTF-8 name.
func ContentDisposition(name string) string {
	return disposition("attachment", name)
}

// sandboxPolicy is served with every preview the browser could interpret (HTML, SVG, text): no
// scripts, an opaque origin, nothing loaded from elsewhere. Only the app itself may frame it.
const sandboxPolicy = "sandbox; default-src 'none'; img-src data:; media-src 'self'; " +
	"style-src 'unsafe-inline'; frame-ancestors 'self'"

func disposition(kind, name string) string {
	fallback := strings.Map(func(r rune) rune {
		if r < 0x20 || r > 0x7e || r == '"' || r == '\\' {
			return '_'
		}
		return r
	}, name)
	return fmt.Sprintf(`%s; filename="%s"; filename*=UTF-8''%s`, kind, fallback, url.PathEscape(name))
}

// ArchiveName picks the downloaded file name for a selection.
func ArchiveName(paths []string) string {
	if len(paths) == 1 && paths[0] != "/" {
		return path.Base(paths[0]) + ".zip"
	}
	parent := path.Dir(paths[0])
	if parent == "/" || parent == "." {
		return "canopy.zip"
	}
	return path.Base(parent) + ".zip"
}

func (s *server) refuse(w http.ResponseWriter, r *http.Request, err error) {
	refusal, known := classify(err)
	if !known {
		errorHandler(s.deps.Logger, http.StatusInternalServerError, codeInternal)(w, r, err)
		return
	}
	errorHandler(s.deps.Logger, refusal.status, refusal.code)(w, r, err)
}

// download serves one file with Range support (resumable downloads).
func (s *server) download(w http.ResponseWriter, r *http.Request) {
	s.serveFile(w, r, false)
}

// preview serves one file inline for the viewer (video seeking uses Range). Seeing the content is
// getting it, so it needs the same `download` right; formats outside the allowlist are refused.
func (s *server) preview(w http.ResponseWriter, r *http.Request) {
	s.serveFile(w, r, true)
}

func (s *server) serveFile(w http.ResponseWriter, r *http.Request, inline bool) {
	ctx := r.Context()
	principal, ok := enginetoken.FromContext(ctx)
	if !ok {
		errorHandler(s.deps.Logger, http.StatusUnauthorized, codeUnauthorized)(w, r, errors.New(codeUnauthorized))
		return
	}
	clean, err := fsx.Clean(r.URL.Query().Get("path"))
	if err != nil {
		s.refuse(w, r, err)
		return
	}
	kind, contentType := preview.Classify(clean)
	if inline && kind == preview.None {
		s.refuse(w, r, errNoPreview)
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
	file, entry, err := s.deps.Ops.OpenFile(clean)
	if errors.Is(err, fsx.ErrNotRegular) {
		s.refuse(w, r, fsx.ErrNotFound)
		return
	}
	if err != nil {
		s.refuse(w, r, err)
		return
	}
	defer func() { _ = file.Close() }()

	// Resumed downloads and media seeking send ranges: only the first request is audited.
	if rng := r.Header.Get("Range"); rng == "" || strings.HasPrefix(rng, "bytes=0-") {
		action := "fs.download"
		if inline {
			action = "fs.preview"
		}
		s.record(ctx, principal, action, clean, map[string]any{"bytes": entry.Size})
	}
	header := w.Header()
	header.Set("X-Content-Type-Options", "nosniff")
	header.Set("Cache-Control", "private, no-store")
	if inline {
		header.Set("Content-Type", contentType)
		header.Set("Content-Disposition", disposition("inline", entry.Name))
		if preview.Sandboxed(kind) {
			header.Set("Content-Security-Policy", sandboxPolicy)
		} else {
			header.Set("Content-Security-Policy", "frame-ancestors 'self'")
		}
	} else {
		header.Set("Content-Type", "application/octet-stream")
		header.Set("Content-Disposition", ContentDisposition(entry.Name))
	}
	http.ServeContent(w, r, entry.Name, entry.Modified, file)
}

// archive streams a zip of the selection as it is read: nothing is staged on disk. Entries the
// person may not download are left out. Files are stored, not compressed: media dominates a NAS
// and compressing it costs CPU for nothing.
func (s *server) archive(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	principal, ok := enginetoken.FromContext(ctx)
	if !ok {
		errorHandler(s.deps.Logger, http.StatusUnauthorized, codeUnauthorized)(w, r, errors.New(codeUnauthorized))
		return
	}
	raw := r.URL.Query()["path"]
	if len(raw) == 0 || len(raw) > maxArchived {
		s.refuse(w, r, fsx.ErrInvalidPath)
		return
	}
	access, err := s.accessOf(ctx, principal)
	if err != nil {
		s.refuse(w, r, err)
		return
	}
	paths := make([]string, 0, len(raw))
	for _, candidate := range raw {
		clean, err := fsx.Clean(candidate)
		if err != nil {
			s.refuse(w, r, err)
			return
		}
		entry, err := s.deps.Ops.Lstat(clean)
		if err != nil {
			s.refuse(w, r, err)
			return
		}
		if !access.CanRead(clean, entry.IsDir) || (!entry.IsDir && !access.Can("download", clean)) {
			s.refuse(w, r, errForbidden)
			return
		}
		paths = append(paths, clean)
	}

	header := w.Header()
	header.Set("Content-Type", "application/zip")
	header.Set("Content-Disposition", ContentDisposition(ArchiveName(paths)))
	header.Set("Cache-Control", "private, no-store")
	s.record(ctx, principal, "fs.download", path.Dir(paths[0]), map[string]any{"archive": true, "items": len(paths)})

	writer := zip.NewWriter(w)
	for _, top := range paths {
		if err := s.addToArchive(ctx, writer, access, top); err != nil {
			// The status line is gone: stop, the client sees a truncated archive.
			logging.FromContext(ctx, s.deps.Logger).Warn("archive interrupted", slog.Any("error", err))
			return
		}
	}
	if err := writer.Close(); err != nil {
		logging.FromContext(ctx, s.deps.Logger).Warn("archive not finished", slog.Any("error", err))
	}
}

func (s *server) addToArchive(ctx context.Context, writer *zip.Writer, access transfer.Access, top string) error {
	base := path.Dir(top)
	entry, err := s.deps.Ops.Lstat(top)
	if err != nil {
		return fmt.Errorf("stat %s: %w", top, err)
	}
	if !entry.IsDir {
		return s.archiveFile(ctx, writer, top, strings.TrimPrefix(top, strings.TrimSuffix(base, "/")+"/"), entry)
	}
	return s.deps.Ops.Walk(top, func(p string, item fsx.Entry) error {
		if err := ctx.Err(); err != nil {
			return fmt.Errorf("stopped: %w", err)
		}
		name := strings.TrimPrefix(p, strings.TrimSuffix(base, "/")+"/")
		switch {
		case item.IsDir && !access.CanRead(p, true):
			return fs.SkipDir
		case item.IsDir:
			_, err := writer.CreateHeader(&zip.FileHeader{Name: name + "/", Modified: item.Modified})
			return err //nolint:wrapcheck // wrapped by the caller
		case item.IsLink || !access.Can("download", p):
			return nil
		default:
			return s.archiveFile(ctx, writer, p, name, item)
		}
	})
}

func (s *server) archiveFile(ctx context.Context, writer *zip.Writer, virtual, name string, entry fsx.Entry) error {
	file, _, err := s.deps.Ops.OpenFile(virtual)
	if errors.Is(err, fsx.ErrNotRegular) || errors.Is(err, fsx.ErrNotFound) {
		// Gone or replaced since the walk listed it: leave it out.
		return nil
	}
	if err != nil {
		return fmt.Errorf("open %s: %w", virtual, err)
	}
	defer func() { _ = file.Close() }()
	modified := entry.Modified
	if modified.IsZero() {
		modified = time.Now()
	}
	out, err := writer.CreateHeader(&zip.FileHeader{Name: name, Method: zip.Store, Modified: modified})
	if err != nil {
		return fmt.Errorf("archive header: %w", err)
	}
	if _, err := io.Copy(out, contextReader{ctx: ctx, reader: file}); err != nil {
		return fmt.Errorf("archive %s: %w", virtual, err)
	}
	return nil
}

// contextReader stops a long copy as soon as the client goes away.
type contextReader struct {
	ctx    context.Context //nolint:containedctx // lives for one copy only
	reader io.Reader
}

func (c contextReader) Read(p []byte) (int, error) {
	if err := c.ctx.Err(); err != nil {
		return 0, err //nolint:wrapcheck // the copy wraps it
	}
	return c.reader.Read(p) //nolint:wrapcheck // the copy wraps it
}
