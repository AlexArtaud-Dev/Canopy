package fsx

import (
	"errors"
	"os"
	"path/filepath"
	"slices"
	"testing"
)

func TestReservedNames(t *testing.T) {
	for _, bad := range []string{"/.canopy-uploads", "/a/.canopy-trash/x", "/.canopy-anything"} {
		if _, err := Clean(bad); !errors.Is(err, ErrInvalidPath) {
			t.Errorf("%s must be unreachable", bad)
		}
	}
	if _, err := Clean("/a/.canopy"); err != nil {
		t.Fatal("only the full prefix is reserved")
	}

	r, dir := newOpsTree(t)
	staging, err := r.EnsureStagingIn("")
	if err != nil || staging != StagingDir {
		t.Fatalf("staging: %s %v", staging, err)
	}
	if volume, err := r.EnsureStagingIn("a"); err != nil || volume != "a/"+StagingDir {
		t.Fatalf("volume staging: %s %v", volume, err)
	}
	for _, bad := range []string{"a/b", "..", StagingDir} {
		if _, err := r.EnsureStagingIn(bad); !errors.Is(err, ErrInvalidPath) {
			t.Fatalf("volume %q: %v", bad, err)
		}
	}
	if _, err := r.EnsureStagingIn("missing"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing volume: %v", err)
	}
	if _, err := r.EnsureStagingIn("a.txt"); err == nil {
		t.Fatal("a file is not a volume")
	}
	must(t, os.WriteFile(filepath.Join(dir, StagingDir, "upload"), []byte("x"), 0o600))
	entries, err := r.ReadDir("/")
	must(t, err)
	for _, entry := range entries {
		if Reserved(entry.Name) {
			t.Fatal("reserved folders are never listed")
		}
	}
	var walked []string
	must(t, r.Walk("/", func(p string, _ Entry) error {
		walked = append(walked, p)
		return nil
	}))
	if slices.Contains(walked, "/"+StagingDir) || slices.Contains(walked, "/"+StagingDir+"/upload") {
		t.Fatalf("reserved folders are never walked: %v", walked)
	}
	must(t, os.WriteFile(filepath.Join(dir, "a", ".canopy-note"), []byte("x"), 0o600))
	walked = nil
	must(t, r.Walk("/a", func(p string, _ Entry) error {
		walked = append(walked, p)
		return nil
	}))
	if slices.Contains(walked, "/a/.canopy-note") {
		t.Fatal("reserved files are skipped too")
	}
}

func TestImportStaged(t *testing.T) {
	r, dir := newOpsTree(t)
	staging, err := r.EnsureStagingIn("a")
	must(t, err)
	write := func(name, content string) string {
		must(t, os.WriteFile(filepath.Join(dir, staging, name), []byte(content), 0o600))
		return staging + "/" + name
	}

	must(t, r.ImportStaged(write("u1", "uploaded"), "/a/new.txt"))
	if data, _ := os.ReadFile(filepath.Join(dir, "a", "new.txt")); string(data) != "uploaded" {
		t.Fatal("imported")
	}
	if err := r.ImportStaged(write("u2", "x"), "/a/new.txt"); !errors.Is(err, ErrExists) {
		t.Fatalf("never replaces: %v", err)
	}
	for _, staged := range []string{"elsewhere/u2", staging, "../u2", "a/b/" + StagingDir + "/u2", staging + "/../u2"} {
		if err := r.ImportStaged(staged, "/a/z.txt"); !errors.Is(err, ErrInvalidPath) {
			t.Fatalf("staged %q: %v", staged, err)
		}
	}
	if err := r.ImportStaged(write("u3", "x"), "rel"); !errors.Is(err, ErrInvalidPath) {
		t.Fatalf("invalid target: %v", err)
	}
	if err := r.ImportStaged(staging+"/missing", "/a/m.txt"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing staged: %v", err)
	}

	// The cross-filesystem path copies then removes the staged file.
	staged := write("u4", "copied")
	must(t, r.copyStaged(staged, "/a/copied.txt"))
	if data, _ := os.ReadFile(filepath.Join(dir, "a", "copied.txt")); string(data) != "copied" {
		t.Fatal("copied")
	}
	if _, err := os.Stat(filepath.Join(dir, staged)); !os.IsNotExist(err) {
		t.Fatal("staged file removed after the copy")
	}
	if err := r.copyStaged(write("u5", "x"), "/a/copied.txt"); !errors.Is(err, ErrExists) {
		t.Fatalf("copy never replaces: %v", err)
	}
	if err := r.copyStaged(staging+"/missing", "/a/n.txt"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("copy of a missing staged file: %v", err)
	}
}
