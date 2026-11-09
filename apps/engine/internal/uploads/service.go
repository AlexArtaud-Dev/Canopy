package uploads

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	tusd "github.com/tus/tusd/v2/pkg/handler"
	expslog "golang.org/x/exp/slog"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/audit"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/authz"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/enginetoken"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/fsx"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/transfer"
)

// BasePath is where tus clients create and continue uploads.
const BasePath = "/v1/uploads/"

// Result headers tell the browser what happened to a finished file.
const (
	HeaderPath   = "X-Canopy-Path"
	HeaderResult = "X-Canopy-Result"
)

// uploadID matches ids made by NewID (random hex, then the volume name in hex), never a path.
var uploadID = regexp.MustCompile(`^[0-9a-f]{32}(?:[0-9a-f]{2}){0,255}$`)

// Files is the slice of fsx.Resolver uploads need.
type Files interface {
	Lstat(virtual string) (fsx.Entry, error)
	Exists(virtual string) (bool, error)
	MkdirAll(virtual string) error
	RemoveAll(virtual string) error
	FreeSpace(virtual string) (uint64, bool)
	ImportStaged(staged, to string) error
}

// Auditor records finished uploads.
type Auditor interface {
	Record(ctx context.Context, event audit.Event) error
}

// Config wires the service.
type Config struct {
	// Root is the managed root on disk; each volume stages its uploads in <volume>/.canopy-uploads.
	Root   string
	Stager Stager
	Files  Files
	Grants transfer.Grants
	Audit  Auditor
	// Limits reads the current upload settings (on each new upload, so changes apply at once).
	Limits func(ctx context.Context) (Limits, error)
	Logger *slog.Logger
	Now    func() time.Time
}

// Service is the tus endpoint with Canopy's checks.
type Service struct {
	cfg     Config
	stores  *volumeStores
	handler http.Handler
}

// New builds the tus handler over one file store per volume.
func New(cfg Config) (*Service, error) {
	stores := &volumeStores{root: cfg.Root, stager: cfg.Stager, dirs: map[string]string{}}
	composer := tusd.NewStoreComposer()
	composer.UseCore(stores)
	composer.UseTerminater(stores)
	composer.UseLocker(stores)
	service := &Service{cfg: cfg, stores: stores}
	handler, err := tusd.NewHandler(tusd.Config{
		BasePath:        BasePath,
		StoreComposer:   composer,
		DisableDownload: true,
		Cors:            &tusd.CorsConfig{Disable: true},
		// tusd's own log (x/exp/slog) is silenced: refusals reach the client and finished uploads
		// are audited and logged here.
		Logger:                    expslog.New(expslog.NewTextHandler(io.Discard, nil)),
		PreUploadCreateCallback:   service.beforeCreate,
		PreFinishResponseCallback: service.beforeFinish,
	})
	if err != nil {
		return nil, fmt.Errorf("tus handler: %w", err)
	}
	// tusd routes relative to its base path (it still uses BasePath to build Location headers).
	service.handler = http.StripPrefix(BasePath, handler)
	return service, nil
}

func refusal(code string, status int) tusd.Error {
	return tusd.NewError(code, http.StatusText(status), status)
}

// ServeHTTP checks that an existing upload belongs to the caller before tusd touches it.
func (s *Service) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	id := strings.Trim(strings.TrimPrefix(r.URL.Path, strings.TrimSuffix(BasePath, "/")), "/")
	if id != "" && r.Method != http.MethodOptions {
		principal, ok := enginetoken.FromContext(r.Context())
		if !ok || !s.owns(r.Context(), id, principal.UserID) {
			http.Error(w, CodeNotUploading+": not found", http.StatusNotFound)
			return
		}
	}
	s.handler.ServeHTTP(w, r)
}

func (s *Service) owns(ctx context.Context, id, user string) bool {
	if !uploadID.MatchString(id) {
		return false
	}
	upload, err := s.stores.GetUpload(ctx, id)
	if err != nil {
		return false
	}
	info, err := upload.GetInfo(ctx)
	return err == nil && info.MetaData["owner"] == user
}

func (s *Service) beforeCreate(hook tusd.HookEvent) (tusd.HTTPResponse, tusd.FileInfoChanges, error) {
	none := tusd.FileInfoChanges{}
	principal, ok := enginetoken.FromContext(hook.Context)
	if !ok {
		return tusd.HTTPResponse{}, none, refusal(enginetoken.CodeMissing, http.StatusUnauthorized)
	}
	request, err := ParseRequest(hook.Upload.MetaData)
	if err != nil || hook.Upload.SizeIsDeferred {
		return tusd.HTTPResponse{}, none, refusal(CodeBadMetadata, http.StatusBadRequest)
	}
	if err := s.checkCreate(hook.Context, principal, request, hook.Upload.Size); err != nil {
		return tusd.HTTPResponse{}, none, err
	}
	meta := tusd.MetaData{
		"owner": principal.UserID, "destination": request.Folder, "relativeDir": request.RelativeDir,
		"filename": request.Name, "strategy": request.Strategy,
	}
	id, err := NewID(VolumeOf(request.Folder))
	if err != nil {
		return tusd.HTTPResponse{}, none, err
	}
	return tusd.HTTPResponse{}, tusd.FileInfoChanges{ID: id, MetaData: meta}, nil
}

// checkCreate refuses an upload before any byte is sent: limits, permission, conflict, space.
func (s *Service) checkCreate(ctx context.Context, principal enginetoken.Principal, request Request, size int64) error {
	limits, err := s.cfg.Limits(ctx)
	if err != nil {
		return fmt.Errorf("load limits: %w", err)
	}
	switch err := limits.Check(request.Name, size); {
	case errors.Is(err, ErrTooLarge):
		return refusal(CodeTooLarge, http.StatusRequestEntityTooLarge)
	case errors.Is(err, ErrBlockedType):
		return refusal(CodeBlockedType, http.StatusUnsupportedMediaType)
	}
	access, err := transfer.LoadAccess(ctx, s.cfg.Grants, subjectOf(principal))
	if err != nil {
		return err //nolint:wrapcheck // answered as an internal error by tusd
	}
	folder, err := s.cfg.Files.Lstat(request.Folder)
	if err != nil || !folder.IsDir {
		return refusal(fsx.CodeNotFound, http.StatusNotFound)
	}
	if !access.Can("upload", request.Folder) {
		return refusal("files.forbidden", http.StatusForbidden)
	}
	if target, err := s.cfg.Files.Lstat(request.Target); err == nil {
		switch {
		case request.Strategy == transfer.StrategySkip, target.IsDir && request.Strategy == transfer.StrategyOverwrite:
			return refusal(fsx.CodeExists, http.StatusConflict)
		case request.Strategy == transfer.StrategyOverwrite && !access.Can("update", request.Target):
			return refusal("files.forbidden", http.StatusForbidden)
		}
	}
	if free, known := s.cfg.Files.FreeSpace(request.Folder); known && uint64(size) > free { //nolint:gosec // tus sizes are never negative
		return refusal(transfer.CodeNoSpace, http.StatusInsufficientStorage)
	}
	return nil
}

func (s *Service) beforeFinish(hook tusd.HookEvent) (tusd.HTTPResponse, error) {
	ctx := hook.Context
	principal, ok := enginetoken.FromContext(ctx)
	request, err := ParseRequest(hook.Upload.MetaData)
	if !ok || err != nil {
		s.discard(hook.Upload.ID)
		return tusd.HTTPResponse{}, refusal(CodeBadMetadata, http.StatusBadRequest)
	}
	target, skipped, err := s.place(ctx, principal, request)
	if err != nil || skipped {
		s.discard(hook.Upload.ID)
		if skipped {
			return tusd.HTTPResponse{Header: tusd.HTTPHeader{HeaderResult: "skipped"}}, nil
		}
		return tusd.HTTPResponse{}, err
	}
	staged, _ := StagedPath(hook.Upload.ID)
	if err := s.cfg.Files.ImportStaged(staged, target); err != nil {
		s.discard(hook.Upload.ID)
		if errors.Is(err, fsx.ErrExists) {
			return tusd.HTTPResponse{}, refusal(fsx.CodeExists, http.StatusConflict)
		}
		return tusd.HTTPResponse{}, fmt.Errorf("import upload: %w", err)
	}
	s.removeMeta(hook.Upload.ID)
	if err := s.cfg.Audit.Record(ctx, audit.Event{
		ActorID: principal.UserID, Action: "fs.upload", Target: target, Result: audit.ResultSuccess,
		RequestID: hook.HTTPRequest.Header.Get("X-Request-Id"), Meta: map[string]any{"bytes": hook.Upload.Size},
	}); err != nil {
		s.cfg.Logger.Error("audit write failed", slog.String("action", "fs.upload"), slog.Any("error", err))
	}
	return tusd.HTTPResponse{Header: tusd.HTTPHeader{HeaderPath: target, HeaderResult: "stored"}}, nil
}

// place re-checks permissions (rules may have changed during a long upload), creates the
// sub-folders of a folder upload and resolves a name taken in the meantime.
func (s *Service) place(ctx context.Context, principal enginetoken.Principal, request Request) (string, bool, error) {
	access, err := transfer.LoadAccess(ctx, s.cfg.Grants, subjectOf(principal))
	if err != nil {
		return "", false, err //nolint:wrapcheck // answered as an internal error by tusd
	}
	if !access.Can("upload", request.Folder) ||
		(request.RelativeDir != "" && !access.Can("create", request.ParentDir())) {
		return "", false, refusal("files.forbidden", http.StatusForbidden)
	}
	if err := s.cfg.Files.MkdirAll(request.ParentDir()); err != nil {
		return "", false, fmt.Errorf("create folders: %w", err)
	}
	existing, err := s.cfg.Files.Lstat(request.Target)
	if errors.Is(err, fsx.ErrNotFound) {
		return request.Target, false, nil
	}
	if err != nil {
		return "", false, fmt.Errorf("check target: %w", err)
	}
	switch request.Strategy {
	case transfer.StrategyKeepBoth:
		parent := request.ParentDir()
		name := transfer.KeepBothName(request.Name, false, func(candidate string) bool {
			taken, err := s.cfg.Files.Exists(path.Join(parent, candidate))
			return err == nil && taken
		})
		return path.Join(parent, name), false, nil
	case transfer.StrategyOverwrite:
		if existing.IsDir || !access.Can("update", request.Target) {
			return "", true, nil
		}
		if err := s.cfg.Files.RemoveAll(request.Target); err != nil {
			return "", false, fmt.Errorf("replace: %w", err)
		}
		return request.Target, false, nil
	default:
		return "", true, nil
	}
}

// stagingDir is the host folder holding an upload (empty when the id is not one of ours).
func (s *Service) stagingDir(id string) string {
	staged, ok := StagedPath(id)
	if !ok {
		return ""
	}
	return filepath.Join(s.cfg.Root, filepath.FromSlash(path.Dir(staged)))
}

func (s *Service) removeMeta(id string) {
	dir := s.stagingDir(id)
	if dir == "" {
		return
	}
	for _, suffix := range []string{".info", ".lock"} {
		_ = os.Remove(filepath.Join(dir, id+suffix))
	}
}

func (s *Service) discard(id string) {
	dir := s.stagingDir(id)
	if dir == "" {
		return
	}
	_ = os.Remove(filepath.Join(dir, id))
	s.removeMeta(id)
}

// PurgeStale deletes uploads abandoned for longer than maxAge (their .info file is untouched),
// in every volume's staging folder, including ones left by an earlier run.
func (s *Service) PurgeStale(maxAge time.Duration) int {
	purged := 0
	for _, dir := range s.stagingDirs() {
		purged += s.purgeIn(dir, maxAge)
	}
	return purged
}

func (s *Service) stagingDirs() []string {
	dirs := []string{filepath.Join(s.cfg.Root, fsx.StagingDir)}
	if volumes, err := os.ReadDir(s.cfg.Root); err == nil {
		for _, volume := range volumes {
			if volume.IsDir() && !fsx.Reserved(volume.Name()) {
				dirs = append(dirs, filepath.Join(s.cfg.Root, volume.Name(), fsx.StagingDir))
			}
		}
	}
	return dirs
}

func (s *Service) purgeIn(dir string, maxAge time.Duration) int {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return 0
	}
	cutoff := s.cfg.Now().Add(-maxAge)
	purged := 0
	for _, entry := range entries {
		id, isInfo := strings.CutSuffix(entry.Name(), ".info")
		if !isInfo || !uploadID.MatchString(id) {
			continue
		}
		info, err := entry.Info()
		if err != nil || info.ModTime().After(cutoff) {
			continue
		}
		s.discard(id)
		purged++
	}
	return purged
}

func subjectOf(principal enginetoken.Principal) authz.Subject {
	return authz.Subject{UserID: principal.UserID, Groups: principal.Groups, Admin: principal.IsAdmin()}
}
