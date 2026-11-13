package fsx

import (
	"encoding/hex"
	"strings"
	"testing"
)

func TestVolumeIDs(t *testing.T) {
	for _, volume := range []string{"", "media", "Disque 1"} {
		id, err := NewVolumeID(volume)
		if err != nil {
			t.Fatal(err)
		}
		if got, ok := VolumeOfID(id); !ok || got != volume {
			t.Fatalf("%q: got %q %v", volume, got, ok)
		}
	}
	random := strings.Repeat("a", randomIDPart)
	for _, crafted := range []string{"..", ".", "a/b", `a\b`} {
		if _, ok := VolumeOfID(random + hex.EncodeToString([]byte(crafted))); ok {
			t.Errorf("%q accepted", crafted)
		}
	}
	for _, junk := range []string{"", "xyz", random + "zz", random + "a"} {
		if _, ok := VolumeOfID(junk); ok {
			t.Errorf("%q accepted", junk)
		}
	}
}

func TestFolderIDs(t *testing.T) {
	id, err := NewFolderID("photos/2024")
	if err != nil {
		t.Fatal(err)
	}
	if folder, ok := FolderOfID(id); !ok || folder != "photos/2024" {
		t.Fatalf("folder: %q %v", folder, ok)
	}
	if volume, err := NewVolumeID("photos"); err != nil {
		t.Fatal(err)
	} else if folder, ok := FolderOfID(volume); !ok || folder != "photos" {
		t.Fatalf("a volume id is a folder id: %q %v", folder, ok)
	}
	for _, bad := range []string{"", "/photos", "photos/", "a/../b", "a/.canopy-x", strings.Repeat("a/", 130)} {
		if _, err := NewFolderID(bad); err == nil {
			t.Errorf("folder %q accepted", bad)
		}
		crafted := strings.Repeat("0", 32) + hex.EncodeToString([]byte(bad))
		if _, ok := FolderOfID(crafted); ok {
			t.Errorf("crafted id for %q accepted", bad)
		}
	}
	if _, ok := FolderOfID("zz"); ok {
		t.Error("not hex")
	}
}
