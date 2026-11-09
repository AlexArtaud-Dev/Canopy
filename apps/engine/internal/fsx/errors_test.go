package fsx

import (
	"errors"
	"os"
	"path/filepath"
	"syscall"
	"testing"
)

// Failure paths: each one is a real situation (a file where a folder is expected, metadata
// clobbered on disk) and must surface as an error, never a panic or a silent success.
func TestFailurePaths(t *testing.T) {
	r, dir := newOpsTree(t)
	must(t, os.WriteFile(filepath.Join(dir, "file.txt"), []byte("x"), 0o644))

	if _, err := r.EnsureStagingIn("file.txt"); !errors.Is(err, ErrNotDir) {
		t.Fatalf("a file is not a volume: %v", err)
	}
	if err := r.MkdirAll("/file.txt/sub"); err == nil {
		t.Fatal("mkdir under a file")
	}
	if !errors.Is(mapWriteError(syscall.EXDEV), ErrCrossDevice) {
		t.Fatal("cross-device renames are recognized")
	}

	// A file named like the trash folder: nothing can be trashed in that volume.
	must(t, os.MkdirAll(filepath.Join(dir, "v"), 0o755))
	must(t, os.WriteFile(filepath.Join(dir, "v", "item.txt"), []byte("x"), 0o644))
	must(t, os.WriteFile(filepath.Join(dir, "v", TrashDir), []byte("x"), 0o644))
	if err := r.TrashPut("/v/item.txt", testID, []byte("{}")); err == nil {
		t.Fatal("trash folder cannot be created")
	}
	if _, err := r.TrashList("v"); err == nil {
		t.Fatal("a trash that is a file cannot be listed")
	}

	// Metadata paths that are folders: writing, removing and reading them fail cleanly.
	must(t, r.TrashPut("/a/one.txt", testID, []byte("{}")))
	metaDir := filepath.Join(dir, "a", TrashDir, testID+".json")
	must(t, os.Remove(metaDir))
	must(t, os.MkdirAll(filepath.Join(metaDir, "keep"), 0o700))
	if err := r.TrashSetMeta("a", testID, []byte("{}")); err == nil {
		t.Fatal("metadata over a folder")
	}
	if items, err := r.TrashList("a"); err != nil || len(items) != 0 {
		t.Fatalf("unreadable metadata is skipped: %v %v", items, err)
	}
	if err := r.TrashRemove("a", testID); err == nil {
		t.Fatal("metadata that cannot be removed is reported")
	}

	// Restoring under a path that became a file cannot recreate the parent.
	second := "cccccccccccccccccccccccccccccccc"
	must(t, os.WriteFile(filepath.Join(dir, "a", "two.txt"), []byte("2"), 0o644))
	must(t, r.TrashPut("/a/two.txt", second, []byte("{}")))
	must(t, os.WriteFile(filepath.Join(dir, "a", "blocker"), []byte("x"), 0o644))
	if err := r.TrashRestore("a", second, "two.txt", "/a/blocker/two.txt"); err == nil {
		t.Fatal("restore under a file")
	}
}

func TestWalkSkipsUnreadableFolders(t *testing.T) {
	if os.Geteuid() <= 0 {
		t.Skip("permissions do not apply here (Windows or root)")
	}
	r, dir := newOpsTree(t)
	locked := filepath.Join(dir, "a", "locked")
	must(t, os.MkdirAll(locked, 0o755))
	must(t, os.Chmod(locked, 0))
	t.Cleanup(func() { _ = os.Chmod(locked, 0o755) })
	var seen []string
	must(t, r.Walk("/a", func(p string, _ Entry) error {
		seen = append(seen, p)
		return nil
	}))
	if len(seen) == 0 {
		t.Fatal("the rest of the tree is still walked")
	}
}
