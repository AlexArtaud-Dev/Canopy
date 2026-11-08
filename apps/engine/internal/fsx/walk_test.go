package fsx

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"slices"
	"testing"
)

func TestWalk(t *testing.T) {
	dir := t.TempDir()
	must(t, os.MkdirAll(filepath.Join(dir, "a", "b"), 0o755))
	must(t, os.WriteFile(filepath.Join(dir, "a", "one.txt"), []byte("12345"), 0o644))
	must(t, os.WriteFile(filepath.Join(dir, "a", "b", "two.txt"), []byte("12"), 0o644))
	must(t, os.MkdirAll(filepath.Join(dir, "skip"), 0o755))
	must(t, os.WriteFile(filepath.Join(dir, "skip", "hidden.txt"), []byte("x"), 0o644))
	resolver, err := OpenResolver(dir)
	must(t, err)
	t.Cleanup(func() { _ = resolver.Close() })

	var seen []string
	var bytes int64
	err = resolver.Walk("/", func(path string, entry Entry) error {
		if path == "/skip" {
			return fs.SkipDir
		}
		seen = append(seen, path)
		bytes += entry.Size
		return nil
	})
	must(t, err)
	want := []string{"/", "/a", "/a/b", "/a/b/two.txt", "/a/one.txt"}
	if !slices.Equal(seen, want) || bytes != 7 {
		t.Fatalf("walk = %v (%d bytes)", seen, bytes)
	}

	if err := resolver.Walk("/a/one.txt", nil); !errors.Is(err, ErrNotDir) {
		t.Fatalf("file: %v", err)
	}
	if err := resolver.Walk("/missing", nil); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing: %v", err)
	}
	if err := resolver.Walk("relative", nil); !errors.Is(err, ErrInvalidPath) {
		t.Fatalf("invalid: %v", err)
	}
	stop := errors.New("stop")
	if err := resolver.Walk("/a", func(string, Entry) error { return stop }); !errors.Is(err, stop) {
		t.Fatalf("visit error: %v", err)
	}
}
