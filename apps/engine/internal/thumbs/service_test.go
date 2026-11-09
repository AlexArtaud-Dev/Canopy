package thumbs

import (
	"context"
	"errors"
	"image/color"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/fsx"
)

type memoryIndex struct {
	mu      sync.Mutex
	entries map[string]Cached
	touched int
	err     error
}

func (m *memoryIndex) Touch(_ context.Context, key string, bytes int64) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.touched++
	if m.entries == nil {
		m.entries = map[string]Cached{}
	}
	m.entries[key] = Cached{Key: key, Bytes: bytes, UsedAt: time.Unix(int64(m.touched), 0)}
	return m.err
}

func (m *memoryIndex) All(context.Context) ([]Cached, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var all []Cached
	for _, entry := range m.entries {
		all = append(all, entry)
	}
	return all, m.err
}

func (m *memoryIndex) Remove(_ context.Context, keys []string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, key := range keys {
		delete(m.entries, key)
	}
	return nil
}

type fixture struct {
	service  *Service
	index    *memoryIndex
	cache    string
	settings Settings
	err      error
	now      time.Time
}

func newFixture(t *testing.T, withCache bool) *fixture {
	t.Helper()
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "photo.png"), pngOf(t, 800, 400, color.White), 0o600); err != nil {
		t.Fatal(err)
	}
	for name, data := range map[string]string{"notes.txt": "hi", "clip.mp4": "x", "empty.png": ""} {
		if err := os.WriteFile(filepath.Join(root, name), []byte(data), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	resolver, err := fsx.OpenResolver(root)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = resolver.Close() })
	f := &fixture{index: &memoryIndex{}, settings: DefaultSettings, now: time.Unix(1000, 0)}
	if withCache {
		f.cache = t.TempDir()
	}
	f.service = NewService(Deps{
		Files: resolver, Index: f.index, Dir: f.cache,
		Settings: func(context.Context) (Settings, error) { return f.settings, f.err },
		Logger:   slog.New(slog.NewTextHandler(io.Discard, nil)),
		Now:      func() time.Time { return f.now },
	})
	return f
}

func TestThumbnailRendersThenServesFromCache(t *testing.T) {
	f := newFixture(t, true)
	ctx := context.Background()
	first, key, err := f.service.Thumbnail(ctx, "/photo.png")
	if err != nil || len(first) == 0 {
		t.Fatalf("render: %v", err)
	}
	if _, err := os.Stat(filepath.Join(f.cache, key[:2], key)); err != nil {
		t.Fatalf("cached on disk: %v", err)
	}
	second, again, err := f.service.Thumbnail(ctx, "/photo.png")
	if err != nil || again != key || string(second) != string(first) || f.index.touched != 2 {
		t.Fatalf("from cache: %v, touched %d", err, f.index.touched)
	}

	f.index.err = errors.New("db down")
	if _, _, err := f.service.Thumbnail(ctx, "/photo.png"); err != nil {
		t.Fatalf("an index failure never blocks a thumbnail: %v", err)
	}
}

func TestThumbnailWithoutCacheAndRefusals(t *testing.T) {
	f := newFixture(t, false)
	ctx := context.Background()
	if _, _, err := f.service.Thumbnail(ctx, "/photo.png"); err != nil || f.index.touched != 0 {
		t.Fatalf("no cache folder: %v, touched %d", err, f.index.touched)
	}
	for path, want := range map[string]error{
		"/notes.txt": ErrUnsupported, "/clip.mp4": ErrUnsupported, "/empty.png": ErrUnsupported,
		"/missing.png": fsx.ErrNotFound,
	} {
		if _, _, err := f.service.Thumbnail(ctx, path); !errors.Is(err, want) {
			t.Errorf("%s: %v, want %v", path, err, want)
		}
	}
	f.settings.Enabled = false
	f.now = f.now.Add(time.Minute)
	if _, _, err := f.service.Thumbnail(ctx, "/photo.png"); !errors.Is(err, ErrDisabled) {
		t.Fatalf("disabled: %v", err)
	}
}

func TestCurrentSettings(t *testing.T) {
	f := newFixture(t, false)
	ctx := context.Background()
	f.err = errors.New("db down")
	if got := f.service.Current(ctx); got != DefaultSettings {
		t.Fatalf("never read: defaults, got %+v", got)
	}
	f.err = nil
	f.settings = Settings{Enabled: false, MaxCacheBytes: 5}
	if got := f.service.Current(ctx); got != f.settings {
		t.Fatalf("read: %+v", got)
	}
	f.settings = DefaultSettings
	if got := f.service.Current(ctx); got.Enabled {
		t.Fatal("kept for the TTL")
	}
	f.now = f.now.Add(time.Minute)
	f.err = errors.New("db down")
	if got := f.service.Current(ctx); got.Enabled {
		t.Fatal("a failed refresh keeps the last values")
	}
}

func TestAvailable(t *testing.T) {
	f := newFixture(t, false)
	on := DefaultSettings
	if !f.service.Available(on, "a.jpg", 10) || f.service.Available(on, "a.mp4", 10) {
		t.Fatal("images yes, videos need ffmpeg")
	}
	f.service.deps.Video = &FrameGrabber{}
	if !f.service.Available(on, "a.mp4", 10) {
		t.Fatal("videos with ffmpeg")
	}
	if f.service.Available(on, "a.jpg", 0) || f.service.Available(on, "a.jpg", MaxSourceBytes+1) ||
		f.service.Available(Settings{}, "a.jpg", 10) {
		t.Fatal("empty, huge or disabled")
	}
}

func TestSweep(t *testing.T) {
	f := newFixture(t, true)
	ctx := context.Background()
	_, key, err := f.service.Thumbnail(ctx, "/photo.png")
	if err != nil {
		t.Fatal(err)
	}
	if err := f.service.Sweep(ctx); err != nil || len(f.index.entries) != 1 {
		t.Fatalf("within the limit: %v", err)
	}
	f.settings.Enabled = false
	f.now = f.now.Add(time.Minute)
	if err := f.service.Sweep(ctx); err != nil || len(f.index.entries) != 0 {
		t.Fatalf("disabled empties the cache: %v", err)
	}
	if _, err := os.Stat(filepath.Join(f.cache, key[:2], key)); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("file removed: %v", err)
	}
	f.index.err = errors.New("db down")
	if err := f.service.Sweep(ctx); err == nil {
		t.Fatal("index failure reported")
	}

	cancelled, cancel := context.WithCancel(ctx)
	cancel()
	f.service.Keep(cancelled, time.Hour)
}

func TestWriteAtomicallyFailure(t *testing.T) {
	blocker := filepath.Join(t.TempDir(), "file")
	if err := os.WriteFile(blocker, nil, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := writeAtomically(filepath.Join(blocker, "ab", "key"), []byte("x")); err == nil {
		t.Fatal("a file in the way")
	}
}
