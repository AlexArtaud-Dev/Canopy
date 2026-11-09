package fsx

import (
	"errors"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

const testID = "0123456789abcdef0123456789abcdef"

func TestTrashRoundTrip(t *testing.T) {
	r, dir := newOpsTree(t)
	must(t, os.MkdirAll(filepath.Join(dir, "a", "sub"), 0o755))
	must(t, os.WriteFile(filepath.Join(dir, "a", "sub", "x.txt"), []byte("x"), 0o644))

	must(t, r.TrashPut("/a/one.txt", testID, []byte(`{"name":"one.txt"}`)))
	if exists, _ := r.Exists("/a/one.txt"); exists {
		t.Fatal("moved out")
	}
	items, err := r.TrashList("a")
	must(t, err)
	if string(items[testID]) != `{"name":"one.txt"}` || len(items) != 1 {
		t.Fatalf("listed: %v", items)
	}
	// The trash itself never shows in listings or walks.
	entries, _ := r.ReadDir("/a")
	for _, entry := range entries {
		if Reserved(entry.Name) {
			t.Fatal("trash listed")
		}
	}

	// Restore into a parent that disappeared meanwhile: it is recreated.
	must(t, r.TrashRestore("a", testID, "one.txt", "/a/gone/one.txt"))
	if data, _ := os.ReadFile(filepath.Join(dir, "a", "gone", "one.txt")); string(data) != "hello" {
		t.Fatal("restored")
	}
	if items, _ := r.TrashList("a"); len(items) != 0 {
		t.Fatal("forgotten after restore")
	}

	second := strings.Repeat("b", 32)
	must(t, r.TrashPut("/a/sub", second, []byte("{}")))
	if err := r.TrashRestore("a", second, "sub", "/a/gone/one.txt"); !errors.Is(err, ErrExists) {
		t.Fatalf("restore never replaces: %v", err)
	}
	must(t, r.TrashRemove("a", second))
	if items, _ := r.TrashList("a"); len(items) != 0 {
		t.Fatal("removed for good")
	}
	must(t, r.TrashRemove("a", second))
}

func TestTrashRefusals(t *testing.T) {
	r, _ := newOpsTree(t)
	if err := r.TrashPut("/a", testID, nil); !errors.Is(err, ErrVolume) {
		t.Fatalf("volumes are never trashed: %v", err)
	}
	if err := r.TrashPut("/", testID, nil); !errors.Is(err, ErrVolume) {
		t.Fatalf("root: %v", err)
	}
	if err := r.TrashPut("/a/one.txt", "../../x", nil); !errors.Is(err, ErrInvalidPath) {
		t.Fatalf("ids are hex: %v", err)
	}
	if err := r.TrashPut("/a/none", testID, nil); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing: %v", err)
	}
	if err := r.TrashPut("rel", testID, nil); !errors.Is(err, ErrInvalidPath) {
		t.Fatalf("invalid: %v", err)
	}
	for _, volume := range []string{"", "a/b", ".canopy-trash"} {
		if _, err := r.TrashList(volume); !errors.Is(err, ErrInvalidPath) {
			t.Errorf("list %q: %v", volume, err)
		}
		if err := r.TrashRemove(volume, testID); !errors.Is(err, ErrInvalidPath) {
			t.Errorf("remove %q: %v", volume, err)
		}
	}
	if err := r.TrashRestore("a", testID, "../x", "/a/x"); !errors.Is(err, ErrInvalidPath) {
		t.Fatalf("restore name: %v", err)
	}
	if err := r.TrashRestore("a", testID, "x", "rel"); !errors.Is(err, ErrInvalidPath) {
		t.Fatalf("restore target: %v", err)
	}
	if err := r.TrashRestore("a", testID, "x", "/a/x"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("restore missing: %v", err)
	}
	if items, err := r.TrashList("b"); err != nil || len(items) != 0 {
		t.Fatalf("no trash yet: %v %v", items, err)
	}
}

func TestVolumes(t *testing.T) {
	r, dir := newOpsTree(t)
	must(t, os.MkdirAll(filepath.Join(dir, "b"), 0o755))
	must(t, os.WriteFile(filepath.Join(dir, "loose.txt"), nil, 0o644))
	volumes, err := r.Volumes()
	must(t, err)
	slices.Sort(volumes)
	if strings.Join(volumes, ",") != "a,b" {
		t.Fatalf("volumes: %v", volumes)
	}
	if VolumeOf("/a/b/c") != "a" || VolumeOf("/a") != "a" || VolumeOf("/") != "" {
		t.Fatal("volume of")
	}
}

func TestTrashPutRollsBack(t *testing.T) {
	r, dir := newOpsTree(t)
	// A folder where the metadata file should go makes writing it fail.
	must(t, os.MkdirAll(filepath.Join(dir, "a", TrashDir, testID+".json"), 0o700))
	if err := r.TrashPut("/a/one.txt", testID, []byte("{}")); err == nil {
		t.Fatal("metadata failure is reported")
	}
	if data, _ := os.ReadFile(filepath.Join(dir, "a", "one.txt")); string(data) != "hello" {
		t.Fatal("the entry is moved back when its metadata cannot be written")
	}
	// A file named like a meta folder entry is skipped when listing.
	must(t, os.WriteFile(filepath.Join(dir, "a", TrashDir, "notes.txt"), nil, 0o600))
	if items, err := r.TrashList("a"); err != nil || len(items) != 0 {
		t.Fatalf("only valid metadata files are listed: %v %v", items, err)
	}
}

func TestTrashMeasure(t *testing.T) {
	r, dir := newOpsTree(t)
	must(t, os.WriteFile(filepath.Join(dir, "a", "two.txt"), []byte("abc"), 0o644))
	must(t, os.MkdirAll(filepath.Join(dir, "a", "f"), 0o755))
	must(t, os.WriteFile(filepath.Join(dir, "a", "f", "x"), []byte("12"), 0o644))
	must(t, os.WriteFile(filepath.Join(dir, "a", "f", "y"), []byte("1"), 0o644))
	must(t, r.TrashPut("/a/f", testID, []byte("{}")))
	bytes, files, err := r.TrashMeasure("a", testID)
	if err != nil || bytes != 3 || files != 2 {
		t.Fatalf("measure: %d %d %v", bytes, files, err)
	}
	must(t, r.TrashSetMeta("a", testID, []byte(`{"measured":true}`)))
	if items, _ := r.TrashList("a"); string(items[testID]) != `{"measured":true}` {
		t.Fatal("metadata rewritten")
	}
	if _, _, err := r.TrashMeasure("a", "zz"); !errors.Is(err, ErrInvalidPath) {
		t.Fatal("bad id")
	}
	if _, _, err := r.TrashMeasure("a", strings.Repeat("c", 32)); err == nil {
		t.Fatal("missing item")
	}
	if err := r.TrashSetMeta("", testID, nil); !errors.Is(err, ErrInvalidPath) {
		t.Fatal("bad volume")
	}
}
