package fsx

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func newOpsTree(t *testing.T) (*Resolver, string) {
	t.Helper()
	dir := t.TempDir()
	must(t, os.MkdirAll(filepath.Join(dir, "a"), 0o755))
	must(t, os.WriteFile(filepath.Join(dir, "a", "one.txt"), []byte("hello"), 0o644))
	old := time.Unix(1_000_000, 0)
	must(t, os.Chtimes(filepath.Join(dir, "a", "one.txt"), old, old))
	resolver, err := OpenResolver(dir)
	must(t, err)
	t.Cleanup(func() { _ = resolver.Close() })
	return resolver, dir
}

func TestMkdirAndRename(t *testing.T) {
	r, dir := newOpsTree(t)
	must(t, r.Mkdir("/b"))
	if err := r.Mkdir("/b"); !errors.Is(err, ErrExists) {
		t.Fatalf("mkdir twice: %v", err)
	}
	if err := r.Mkdir("/missing/c"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("mkdir without parent: %v", err)
	}
	must(t, r.MkdirAll("/b/c/d"))
	must(t, r.MkdirAll("/b/c/d"))

	must(t, r.Rename("/a/one.txt", "/b/one.txt"))
	if _, err := os.Stat(filepath.Join(dir, "b", "one.txt")); err != nil {
		t.Fatal("renamed file missing")
	}
	must(t, os.WriteFile(filepath.Join(dir, "a", "two.txt"), []byte("x"), 0o644))
	if err := r.Rename("/a/two.txt", "/b/one.txt"); !errors.Is(err, ErrExists) {
		t.Fatalf("rename onto a file must refuse: %v", err)
	}
	if err := r.Rename("/a/nope", "/b/nope"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("rename missing: %v", err)
	}
	for _, bad := range [][2]string{{"rel", "/x"}, {"/a/two.txt", "rel"}} {
		if err := r.Rename(bad[0], bad[1]); !errors.Is(err, ErrInvalidPath) {
			t.Fatalf("invalid %v: %v", bad, err)
		}
	}
	for _, bad := range []string{"rel"} {
		if r.Mkdir(bad) == nil || r.MkdirAll(bad) == nil || r.RemoveAll(bad) == nil {
			t.Fatal("invalid paths are refused")
		}
		if _, err := r.Exists(bad); err == nil {
			t.Fatal("exists on invalid path")
		}
	}

	must(t, r.MkdirAll("/empty"))
	must(t, r.RemoveEmptyDir("/empty"))
	if r.RemoveEmptyDir("/b") == nil {
		t.Fatal("a non-empty directory stays")
	}
	if r.RemoveEmptyDir("/") == nil || r.RemoveEmptyDir("rel") == nil {
		t.Fatal("root and invalid paths are refused")
	}
	must(t, r.RemoveAll("/b"))
	if exists, _ := r.Exists("/b"); exists {
		t.Fatal("removed")
	}
	if err := r.RemoveAll("/"); !errors.Is(err, ErrInvalidPath) {
		t.Fatal("the root itself is never removed")
	}
}

func TestCopyFile(t *testing.T) {
	r, dir := newOpsTree(t)
	var copied int64
	must(t, r.CopyFile(context.Background(), "/a/one.txt", "/a/copy.txt", false, func(n int64) { copied += n }))
	data, _ := os.ReadFile(filepath.Join(dir, "a", "copy.txt"))
	info, _ := os.Stat(filepath.Join(dir, "a", "copy.txt"))
	if string(data) != "hello" || copied != 5 || !info.ModTime().Equal(time.Unix(1_000_000, 0)) {
		t.Fatalf("copy: %q %d %v", data, copied, info.ModTime())
	}
	if err := r.CopyFile(context.Background(), "/a/one.txt", "/a/copy.txt", false, nil); !errors.Is(err, ErrExists) {
		t.Fatalf("no implicit overwrite: %v", err)
	}
	must(t, os.WriteFile(filepath.Join(dir, "a", "copy.txt"), []byte("a much longer old content"), 0o644))
	must(t, r.CopyFile(context.Background(), "/a/one.txt", "/a/copy.txt", true, nil))
	if data, _ := os.ReadFile(filepath.Join(dir, "a", "copy.txt")); string(data) != "hello" {
		t.Fatalf("overwrite truncates: %q", data)
	}
	if err := r.CopyFile(context.Background(), "/a", "/b", false, nil); !errors.Is(err, ErrNotRegular) {
		t.Fatalf("directory: %v", err)
	}
	if err := r.CopyFile(context.Background(), "/missing", "/b", false, nil); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing: %v", err)
	}
	if err := r.CopyFile(context.Background(), "/a/one.txt", "/missing/x", false, nil); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing target dir: %v", err)
	}
	if r.CopyFile(context.Background(), "rel", "/x", false, nil) == nil || r.CopyFile(context.Background(), "/a/one.txt", "rel", false, nil) == nil {
		t.Fatal("invalid paths")
	}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := r.CopyFile(ctx, "/a/one.txt", "/a/cancelled.txt", false, nil); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancel: %v", err)
	}
	if exists, _ := r.Exists("/a/cancelled.txt"); exists {
		t.Fatal("a cancelled copy leaves no partial file")
	}
}

func TestCopyWithProgressErrors(t *testing.T) {
	failing := errors.New("disk")
	if err := copyWithProgress(context.Background(), failWriter{failing}, strings.NewReader("x"), nil); !errors.Is(err, failing) {
		t.Fatalf("write error: %v", err)
	}
	if err := copyWithProgress(context.Background(), &strings.Builder{}, failReader{failing}, nil); !errors.Is(err, failing) {
		t.Fatalf("read error: %v", err)
	}
	other := errors.New("other")
	if err := mapWriteError(other); !errors.Is(err, other) || errors.Is(err, ErrExists) {
		t.Fatalf("unknown errors are wrapped as is: %v", err)
	}
}

type failWriter struct{ err error }

func (f failWriter) Write([]byte) (int, error) { return 0, f.err }

type failReader struct{ err error }

func (f failReader) Read([]byte) (int, error) { return 0, f.err }

func TestValidName(t *testing.T) {
	for _, name := range []string{"photo.jpg", "été", "a b", ".hidden"} {
		if !ValidName(name) {
			t.Errorf("%q should be valid", name)
		}
	}
	for _, name := range []string{"", ".", "..", "a/b", `a\b`, "a\x00", "tab\there", strings.Repeat("x", 256)} {
		if ValidName(name) {
			t.Errorf("%q should be refused", name)
		}
	}
}

func TestLstatAndFreeSpace(t *testing.T) {
	r, _ := newOpsTree(t)
	entry, err := r.Lstat("/a/one.txt")
	if err != nil || entry.Size != 5 {
		t.Fatalf("lstat: %+v %v", entry, err)
	}
	if _, err := r.Lstat("/nope"); !errors.Is(err, ErrNotFound) {
		t.Fatal("lstat missing")
	}
	if _, err := r.Lstat("rel"); !errors.Is(err, ErrInvalidPath) {
		t.Fatal("lstat invalid")
	}
	// Free space is platform dependent: only check it never panics and is consistent.
	if free, ok := r.FreeSpace("/a"); ok && free == 0 {
		t.Log("filesystem reports no free space")
	}
	if _, ok := r.FreeSpace("rel"); ok {
		t.Fatal("invalid path has no free space")
	}
}

func TestOpenFile(t *testing.T) {
	r, _ := newOpsTree(t)
	file, entry, err := r.OpenFile("/a/one.txt")
	if err != nil || entry.Name != "one.txt" || entry.Size != 5 {
		t.Fatalf("open: %+v %v", entry, err)
	}
	_ = file.Close()
	if _, _, err := r.OpenFile("/a"); !errors.Is(err, ErrNotRegular) {
		t.Fatalf("folder: %v", err)
	}
	if _, _, err := r.OpenFile("/nope"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing: %v", err)
	}
	if _, _, err := r.OpenFile("rel"); !errors.Is(err, ErrInvalidPath) {
		t.Fatalf("invalid: %v", err)
	}
}
