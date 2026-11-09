package fsx

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"regexp"
	"strings"
)

// randomIDPart is the length (hex) of the random half of a volume id.
const randomIDPart = 32

// volumeID matches ids made by NewVolumeID: hexadecimal only, so never a path.
var volumeID = regexp.MustCompile(`^[0-9a-f]{32}(?:[0-9a-f]{2}){0,255}$`)

// NewVolumeID makes an id that remembers its volume (uploads in staging, items in the trash):
// 32 random hex characters, then the volume name in hex.
func NewVolumeID(volume string) (string, error) {
	random := make([]byte, randomIDPart/2)
	if _, err := rand.Read(random); err != nil {
		return "", fmt.Errorf("volume id: %w", err)
	}
	return hex.EncodeToString(random) + hex.EncodeToString([]byte(volume)), nil
}

// VolumeOfID reads the volume back from an id made by NewVolumeID.
func VolumeOfID(id string) (string, bool) {
	if !volumeID.MatchString(id) {
		return "", false
	}
	volume, err := hex.DecodeString(id[randomIDPart:])
	if err != nil || strings.ContainsAny(string(volume), "/\\") {
		return "", false
	}
	return string(volume), true
}
