package uploads

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"path"
	"path/filepath"
	"strings"
	"sync"

	"github.com/tus/tusd/v2/pkg/filelocker"
	"github.com/tus/tusd/v2/pkg/filestore"
	tusd "github.com/tus/tusd/v2/pkg/handler"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/fsx"
)

// randomPart is the length (hex) of the random half of an upload id.
const randomPart = 32

// VolumeOf is the first segment of a clean path: uploads are staged in that volume so finishing
// one is a rename on the same filesystem (in Docker, the root itself is read-only).
func VolumeOf(clean string) string {
	trimmed := strings.TrimPrefix(clean, "/")
	if first, _, found := strings.Cut(trimmed, "/"); found {
		return first
	}
	return trimmed
}

// NewID makes an upload id carrying its volume: 32 random hex characters, then the volume name
// in hex. Ids stay hexadecimal, so they are never paths.
func NewID(volume string) (string, error) {
	random := make([]byte, randomPart/2)
	if _, err := rand.Read(random); err != nil {
		return "", fmt.Errorf("upload id: %w", err)
	}
	return hex.EncodeToString(random) + hex.EncodeToString([]byte(volume)), nil
}

// VolumeOfID reads the volume back from an upload id.
func VolumeOfID(id string) (string, bool) {
	if !uploadID.MatchString(id) {
		return "", false
	}
	volume, err := hex.DecodeString(id[randomPart:])
	if err != nil || strings.ContainsAny(string(volume), "/\\") {
		return "", false
	}
	return string(volume), true
}

// StagedPath is where an upload's data sits, relative to the root.
func StagedPath(id string) (string, bool) {
	volume, ok := VolumeOfID(id)
	if !ok {
		return "", false
	}
	return path.Join(volume, fsx.StagingDir, id), true
}

// Stager prepares a volume's staging folder (fsx.Resolver.EnsureStagingIn).
type Stager interface {
	EnsureStagingIn(volume string) (string, error)
}

// volumeStores routes tusd to one file store per volume.
type volumeStores struct {
	root   string
	stager Stager
	mu     sync.Mutex
	dirs   map[string]string
}

func (v *volumeStores) hostDir(volume string) (string, error) {
	v.mu.Lock()
	defer v.mu.Unlock()
	if dir, ok := v.dirs[volume]; ok {
		return dir, nil
	}
	relative, err := v.stager.EnsureStagingIn(volume)
	if err != nil {
		return "", fmt.Errorf("staging for %q: %w", volume, err)
	}
	dir := filepath.Join(v.root, filepath.FromSlash(relative))
	v.dirs[volume] = dir
	return dir, nil
}

func (v *volumeStores) storeFor(id string) (filestore.FileStore, error) {
	volume, ok := VolumeOfID(id)
	if !ok {
		return filestore.FileStore{}, tusd.ErrNotFound
	}
	dir, err := v.hostDir(volume)
	if err != nil {
		return filestore.FileStore{}, err
	}
	return filestore.New(dir), nil
}

// NewUpload stores the upload in its volume; the id was chosen in the create hook.
func (v *volumeStores) NewUpload(ctx context.Context, info tusd.FileInfo) (tusd.Upload, error) {
	store, err := v.storeFor(info.ID)
	if err != nil {
		return nil, err
	}
	return store.NewUpload(ctx, info) //nolint:wrapcheck // tusd's own errors carry HTTP statuses
}

func (v *volumeStores) GetUpload(ctx context.Context, id string) (tusd.Upload, error) {
	store, err := v.storeFor(id)
	if err != nil {
		return nil, err
	}
	return store.GetUpload(ctx, id) //nolint:wrapcheck // tusd's own errors carry HTTP statuses
}

// AsTerminatableUpload works on any file store's uploads (it only changes their type).
func (v *volumeStores) AsTerminatableUpload(upload tusd.Upload) tusd.TerminatableUpload {
	return filestore.FileStore{}.AsTerminatableUpload(upload)
}

func (v *volumeStores) NewLock(id string) (tusd.Lock, error) {
	volume, ok := VolumeOfID(id)
	if !ok {
		return nil, tusd.ErrNotFound
	}
	dir, err := v.hostDir(volume)
	if err != nil {
		return nil, err
	}
	return filelocker.New(dir).NewLock(id) //nolint:wrapcheck // tusd's own errors
}

// knownDirs lists the staging folders created so far (for purges).
func (v *volumeStores) knownDirs() []string {
	v.mu.Lock()
	defer v.mu.Unlock()
	dirs := make([]string, 0, len(v.dirs))
	for _, dir := range v.dirs {
		dirs = append(dirs, dir)
	}
	return dirs
}
