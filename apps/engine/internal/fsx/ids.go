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
	// A crafted id must not name a folder outside the root ("..") or the root twice (".").
	if err != nil || strings.ContainsAny(string(volume), "/\\") || string(volume) == "." || string(volume) == ".." {
		return "", false
	}
	return string(volume), true
}

// NewFolderID makes an id that remembers a folder of the root ("photos" or "photos/2024"): an
// upload staged in that folder's staging folder. Folders up to 255 bytes long fit.
func NewFolderID(folder string) (string, error) {
	if !ValidFolder(folder) {
		return "", ErrInvalidPath
	}
	return NewVolumeID(folder)
}

// FolderOfID reads the folder back from an id made by NewFolderID (or NewVolumeID): every
// segment a plain name, none reserved, so that a crafted id names no folder outside the root.
func FolderOfID(id string) (string, bool) {
	if !volumeID.MatchString(id) {
		return "", false
	}
	folder, err := hex.DecodeString(id[randomIDPart:])
	if err != nil || !ValidFolder(string(folder)) {
		return "", false
	}
	return string(folder), true
}

// ValidFolder reports whether a relative folder path ("photos/2024") is one Canopy may stage
// uploads in: plain names, none reserved, no "." or "..".
func ValidFolder(folder string) bool {
	if folder == "" || len(folder) > 255 {
		return false
	}
	for _, segment := range strings.Split(folder, "/") {
		if !ValidName(segment) || Reserved(segment) {
			return false
		}
	}
	return true
}
