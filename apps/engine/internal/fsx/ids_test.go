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
