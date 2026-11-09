package fsx

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestHostPath(t *testing.T) {
	outside := t.TempDir()
	dir := t.TempDir()
	must(t, os.MkdirAll(filepath.Join(dir, "media", "photos"), 0o755))
	r, err := OpenResolver(dir)
	must(t, err)
	t.Cleanup(func() { _ = r.Close() })
	base, err := filepath.EvalSymlinks(dir)
	must(t, err)

	if got, err := r.HostPath("/media/photos"); err != nil || got != filepath.Join(base, "media", "photos") {
		t.Fatalf("existing: %q %v", got, err)
	}
	if got, err := r.HostPath("/media/new/deep"); err != nil || got != filepath.Join(base, "media", "new", "deep") {
		t.Fatalf("not there yet: %q %v", got, err)
	}
	if got, err := r.HostPath("/"); err != nil || got != base {
		t.Fatalf("root: %q %v", got, err)
	}
	if _, err := r.HostPath("relative"); !errors.Is(err, ErrInvalidPath) {
		t.Fatalf("invalid: %v", err)
	}
	if err := os.Symlink(outside, filepath.Join(dir, "media", "escape")); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}
	for _, path := range []string{"/media/escape", "/media/escape/new"} {
		if _, err := r.HostPath(path); !errors.Is(err, ErrOutsideRoot) {
			t.Fatalf("%s: %v", path, err)
		}
	}
}
