package fsx

import (
	"errors"
	"io"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestWriteNew(t *testing.T) {
	dir := t.TempDir()
	r, err := OpenResolver(dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = r.Close() })
	at := time.Date(2020, 1, 2, 3, 4, 5, 0, time.UTC)

	if err := r.WriteNew("/a.txt", at, func(w io.Writer) error {
		_, err := io.WriteString(w, "hello")
		return err
	}); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(filepath.Join(dir, "a.txt"))
	if err != nil || info.Size() != 5 || !info.ModTime().Equal(at) {
		t.Fatalf("written: %v %v", info, err)
	}
	if err := r.WriteNew("/b.txt", time.Time{}, func(io.Writer) error { return nil }); err != nil {
		t.Fatalf("no time: %v", err)
	}

	if err := r.WriteNew("/a.txt", at, func(io.Writer) error { return nil }); !errors.Is(err, ErrExists) {
		t.Fatalf("never overwrites: %v", err)
	}
	failure := errors.New("source broke")
	if err := r.WriteNew("/c.txt", at, func(w io.Writer) error {
		_, _ = io.WriteString(w, "partial")
		return failure
	}); !errors.Is(err, failure) {
		t.Fatalf("failure: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "c.txt")); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("a partial file is removed")
	}
	if err := r.WriteNew("relative", at, func(io.Writer) error { return nil }); !errors.Is(err, ErrInvalidPath) {
		t.Fatalf("invalid path: %v", err)
	}
}
