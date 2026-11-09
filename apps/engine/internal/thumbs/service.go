package thumbs

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"time"

	"golang.org/x/sync/singleflight"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/fsx"
)

// ErrDisabled means thumbnails are turned off in the settings.
var ErrDisabled = errors.New("thumbnails are disabled")

// settingsTTL: listings ask for every entry; the settings are read at most this often.
const settingsTTL = 30 * time.Second

// Files is the root-confined access the service needs.
type Files interface {
	OpenFile(virtual string) (*os.File, fsx.Entry, error)
}

// Index records cached thumbnails for size-bounded eviction (engine.thumbnails).
type Index interface {
	Touch(ctx context.Context, key string, bytes int64) error
	All(ctx context.Context) ([]Cached, error)
	Remove(ctx context.Context, keys []string) error
}

// Deps wire the service.
type Deps struct {
	Files Files
	Index Index
	// Dir holds the cached files; empty means no disk cache (thumbnails rendered each time).
	Dir      string
	Video    *FrameGrabber
	Settings func(ctx context.Context) (Settings, error)
	Logger   *slog.Logger
	Now      func() time.Time
}

// Service renders and caches thumbnails.
type Service struct {
	deps  Deps
	slots chan struct{}
	group singleflight.Group

	mu        sync.Mutex
	settings  Settings
	settingAt time.Time
}

// NewService starts with one rendering slot per CPU: decoding is CPU-bound.
func NewService(deps Deps) *Service {
	if deps.Now == nil {
		deps.Now = time.Now
	}
	return &Service{deps: deps, slots: make(chan struct{}, max(runtime.NumCPU(), 2))}
}

// Current returns the settings, re-read from the database at most every settingsTTL. A read
// failure keeps the last known values.
func (s *Service) Current(ctx context.Context) Settings {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := s.deps.Now()
	if !s.settingAt.IsZero() && now.Sub(s.settingAt) < settingsTTL {
		return s.settings
	}
	settings, err := s.deps.Settings(ctx)
	if err != nil {
		s.deps.Logger.WarnContext(ctx, "thumbnail settings unreadable", "error", err)
		if s.settingAt.IsZero() {
			return DefaultSettings
		}
		return s.settings
	}
	s.settings, s.settingAt = settings, now
	return settings
}

// Available tells whether a listed file gets a thumbnail.
func (s *Service) Available(settings Settings, name string, size int64) bool {
	if !settings.Enabled || size == 0 || size > MaxSourceBytes {
		return false
	}
	switch SourceOf(name) {
	case SourceImage:
		return true
	case SourceVideo:
		return s.deps.Video != nil
	default:
		return false
	}
}

// Thumbnail returns the thumbnail of a file (JPEG or PNG) and its cache key.
func (s *Service) Thumbnail(ctx context.Context, virtual string) ([]byte, string, error) {
	settings := s.Current(ctx)
	if !settings.Enabled {
		return nil, "", ErrDisabled
	}
	file, entry, err := s.deps.Files.OpenFile(virtual)
	if err != nil {
		return nil, "", err
	}
	defer func() { _ = file.Close() }()
	if !s.Available(settings, entry.Name, entry.Size) {
		return nil, "", ErrUnsupported
	}
	key := Key(virtual, entry.Size, entry.Modified)
	if data, ok := s.cached(key); ok {
		s.touch(ctx, key, int64(len(data)))
		return data, key, nil
	}
	// Several tiles asking for the same file at once share one rendering.
	value, err, _ := s.group.Do(key, func() (any, error) {
		data, err := s.render(ctx, file, entry.Name)
		if err == nil {
			s.store(ctx, key, data)
		}
		return data, err
	})
	if err != nil {
		return nil, "", fmt.Errorf("render thumbnail: %w", err)
	}
	data, _ := value.([]byte)
	return data, key, nil
}

func (s *Service) render(ctx context.Context, file *os.File, name string) ([]byte, error) {
	select {
	case s.slots <- struct{}{}:
	case <-ctx.Done():
		return nil, fmt.Errorf("wait for a rendering slot: %w", ctx.Err())
	}
	defer func() { <-s.slots }()
	if SourceOf(name) == SourceVideo {
		return s.deps.Video.Grab(ctx, file)
	}
	return RenderImage(file)
}

// pathOf shards cached files by the first byte of the key (keys are hex digests, never input).
func (s *Service) pathOf(key string) string {
	return filepath.Join(s.deps.Dir, key[:2], key)
}

func (s *Service) cached(key string) ([]byte, bool) {
	if s.deps.Dir == "" {
		return nil, false
	}
	data, err := os.ReadFile(s.pathOf(key))
	return data, err == nil
}

// store writes the file then indexes it; a failure only costs a new rendering next time.
func (s *Service) store(ctx context.Context, key string, data []byte) {
	if s.deps.Dir == "" {
		return
	}
	if err := writeAtomically(s.pathOf(key), data); err != nil {
		s.deps.Logger.WarnContext(ctx, "thumbnail not cached", "error", err)
		return
	}
	s.touch(ctx, key, int64(len(data)))
}

func (s *Service) touch(ctx context.Context, key string, bytes int64) {
	if err := s.deps.Index.Touch(ctx, key, bytes); err != nil {
		s.deps.Logger.WarnContext(ctx, "thumbnail not indexed", "error", err)
	}
}

func writeAtomically(target string, data []byte) error {
	if err := os.MkdirAll(filepath.Dir(target), 0o750); err != nil {
		return fmt.Errorf("create cache folder: %w", err)
	}
	temporary, err := os.CreateTemp(filepath.Dir(target), ".tmp-*")
	if err != nil {
		return fmt.Errorf("create cache file: %w", err)
	}
	defer func() { _ = os.Remove(temporary.Name()) }()
	if _, err := temporary.Write(data); err != nil {
		_ = temporary.Close()
		return fmt.Errorf("write cache file: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return fmt.Errorf("close cache file: %w", err)
	}
	if err := os.Rename(temporary.Name(), target); err != nil {
		return fmt.Errorf("place cache file: %w", err)
	}
	return nil
}

// Sweep removes the least recently used thumbnails beyond the cache size (all of them when
// thumbnails are turned off).
func (s *Service) Sweep(ctx context.Context) error {
	settings := s.Current(ctx)
	limit := settings.MaxCacheBytes
	if !settings.Enabled {
		limit = 0
	}
	entries, err := s.deps.Index.All(ctx)
	if err != nil {
		return fmt.Errorf("list cached thumbnails: %w", err)
	}
	evicted := Evictions(entries, limit)
	if len(evicted) == 0 {
		return nil
	}
	for _, key := range evicted {
		if err := os.Remove(s.pathOf(key)); err != nil && !errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("remove cached thumbnail: %w", err)
		}
	}
	if err := s.deps.Index.Remove(ctx, evicted); err != nil {
		return fmt.Errorf("unindex thumbnails: %w", err)
	}
	return nil
}

// Keep sweeps on a schedule until the context ends.
func (s *Service) Keep(ctx context.Context, every time.Duration) {
	ticker := time.NewTicker(every)
	defer ticker.Stop()
	for {
		if err := s.Sweep(ctx); err != nil {
			s.deps.Logger.WarnContext(ctx, "thumbnail sweep failed", "error", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}
