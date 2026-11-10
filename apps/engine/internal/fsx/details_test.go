package fsx

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestDescribe(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "docs"), 0o750); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "docs", "a.txt"), []byte("a"), 0o640); err != nil {
		t.Fatal(err)
	}
	resolver, err := OpenResolver(dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = resolver.Close() })

	file, err := resolver.Describe("/docs/a.txt")
	if err != nil || !file.Mode.IsRegular() || file.LinkTarget != "" {
		t.Fatalf("file: %+v %v", file, err)
	}
	folder, err := resolver.Describe("/docs")
	if err != nil || !folder.Mode.IsDir() {
		t.Fatalf("folder: %+v %v", folder, err)
	}
	if runtime.GOOS == "linux" {
		if file.Mode.Perm() != 0o640 || file.Owner == nil || file.Owner.UID != uint32(os.Getuid()) || file.Changed.IsZero() { //nolint:gosec // test uid
			t.Fatalf("host details: %+v", file)
		}
	}
	if _, err := resolver.Describe("/docs/none"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing: %v", err)
	}
	if _, err := resolver.Describe("../x"); err == nil {
		t.Fatal("escaping path accepted")
	}

	if err := os.Symlink("a.txt", filepath.Join(dir, "docs", "near")); err != nil {
		t.Skipf("no symbolic links here: %v", err)
	}
	if err := os.Symlink(filepath.Join(dir, "docs", "a.txt"), filepath.Join(dir, "docs", "far")); err != nil {
		t.Fatal(err)
	}
	near, err := resolver.Describe("/docs/near")
	if err != nil || near.Mode&fs.ModeSymlink == 0 || near.LinkTarget != "a.txt" {
		t.Fatalf("relative link: %+v %v", near, err)
	}
	if far, _ := resolver.Describe("/docs/far"); far.LinkTarget != "" {
		t.Fatalf("absolute target leaked: %q", far.LinkTarget)
	}
}

func TestRelativeTarget(t *testing.T) {
	for target, want := range map[string]string{"": "", "../b": "../b", "/etc/passwd": "", "sub/c": "sub/c"} {
		if got := relativeTarget(target); got != want {
			t.Errorf("%q: %q, want %q", target, got, want)
		}
	}
}
