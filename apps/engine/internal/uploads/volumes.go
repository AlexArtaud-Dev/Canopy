package uploads

import (
	"context"
	"fmt"
	"os"
	"path"
	"path/filepath"
	"slices"
	"strings"
	"sync"

	"github.com/tus/tusd/v2/pkg/filelocker"
	"github.com/tus/tusd/v2/pkg/filestore"
	tusd "github.com/tus/tusd/v2/pkg/handler"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/fsx"
)

// VolumeOf is the first segment of a clean path: uploads are staged in that volume so finishing
// one is a rename on the same filesystem (in Docker, the root itself is read-only).
func VolumeOf(clean string) string {
	return fsx.VolumeOf(clean)
}

// NewID makes an upload id carrying the folder it is staged in: its volume, or its destination
// folder when the top of the volume cannot be written (fsx.NewFolderID). The root's own
// staging folder is "".
func NewID(folder string) (string, error) {
	if folder == "" {
		return fsx.NewVolumeID("") //nolint:wrapcheck // already wrapped
	}
	return fsx.NewFolderID(folder) //nolint:wrapcheck // already wrapped
}

// FolderOfID reads back the folder an upload is staged in.
func FolderOfID(id string) (string, bool) {
	if folder, ok := fsx.FolderOfID(id); ok {
		return folder, true
	}
	// The root's own staging folder: an id carrying no folder.
	volume, ok := fsx.VolumeOfID(id)
	return volume, ok && volume == ""
}

// StagedPath is where an upload's data sits, relative to the root.
func StagedPath(id string) (string, bool) {
	folder, ok := FolderOfID(id)
	if !ok {
		return "", false
	}
	return path.Join(folder, fsx.StagingDir, id), true
}

// Stager prepares a folder's staging folder (fsx.Resolver.EnsureStagingIn).
type Stager interface {
	EnsureStagingIn(volume string) (string, error)
}

// volumeStores routes tusd to one file store per staging folder (a volume's, or a deeper
// folder's).
type volumeStores struct {
	root   string
	stager Stager
	// ledger lists the staging folders below volumes (one host path per line), so that uploads
	// abandoned there are purged after a restart too. Empty keeps them in memory only.
	ledger string
	mu     sync.Mutex
	dirs   map[string]string
}

func (v *volumeStores) hostDir(folder string) (string, error) {
	v.mu.Lock()
	defer v.mu.Unlock()
	if dir, ok := v.dirs[folder]; ok {
		return dir, nil
	}
	relative, err := v.stager.EnsureStagingIn(folder)
	if err != nil {
		return "", fmt.Errorf("staging for %q: %w", folder, err)
	}
	dir := filepath.Join(v.root, filepath.FromSlash(relative))
	v.dirs[folder] = dir
	if strings.Contains(folder, "/") {
		v.remember(dir)
	}
	return dir, nil
}

// remember adds a deep staging folder to the ledger, once.
func (v *volumeStores) remember(dir string) {
	if v.ledger == "" || slices.Contains(readLedger(v.ledger), dir) {
		return
	}
	file, err := os.OpenFile(v.ledger, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		return
	}
	defer func() { _ = file.Close() }()
	_, _ = file.WriteString(dir + "\n")
}

// readLedger lists the staging folders a ledger file names.
func readLedger(ledger string) []string {
	if ledger == "" {
		return nil
	}
	data, err := os.ReadFile(ledger) //nolint:gosec // the engine's own file in its cache folder
	if err != nil {
		return nil
	}
	return slices.DeleteFunc(strings.Split(string(data), "\n"), func(line string) bool { return line == "" })
}

func (v *volumeStores) storeFor(id string) (filestore.FileStore, error) {
	folder, ok := FolderOfID(id)
	if !ok {
		return filestore.FileStore{}, tusd.ErrNotFound
	}
	dir, err := v.hostDir(folder)
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
	folder, ok := FolderOfID(id)
	if !ok {
		return nil, tusd.ErrNotFound
	}
	dir, err := v.hostDir(folder)
	if err != nil {
		return nil, err
	}
	return filelocker.New(dir).NewLock(id) //nolint:wrapcheck // tusd's own errors
}

// knownDirs lists the staging folders created so far, and those of the ledger (for purges).
func (v *volumeStores) knownDirs() []string {
	v.mu.Lock()
	defer v.mu.Unlock()
	dirs := readLedger(v.ledger)
	for _, dir := range v.dirs {
		if !slices.Contains(dirs, dir) {
			dirs = append(dirs, dir)
		}
	}
	return dirs
}
