package fsx

import (
	"errors"
	"fmt"
	"io/fs"
	"path"
	"regexp"
	"strings"
)

// TrashDir holds deleted items inside each volume, so deleting is a rename on the same filesystem.
const TrashDir = ReservedPrefix + "trash"

// trashID is the engine's id format: hexadecimal only, never a path.
var trashID = regexp.MustCompile(`^[0-9a-f]{32,544}$`)

// ErrVolume refuses deleting a volume itself (top-level folders are mounts).
var ErrVolume = errors.New("volumes cannot be deleted")

// VolumeOf is the first segment of a clean path ("" for the root itself).
func VolumeOf(clean string) string {
	trimmed := strings.TrimPrefix(clean, "/")
	first, _, _ := strings.Cut(trimmed, "/")
	return first
}

func (r *Resolver) trashSlot(volume, id string) (string, error) {
	if volume == "" || !ValidName(volume) || Reserved(volume) || !trashID.MatchString(id) {
		return "", ErrInvalidPath
	}
	return volume + "/" + TrashDir + "/" + id, nil
}

// Volumes lists the top-level folders of the root (each one a volume).
func (r *Resolver) Volumes() ([]string, error) {
	entries, err := r.ReadDir("/")
	if err != nil {
		return nil, err
	}
	volumes := make([]string, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir && !entry.IsLink {
			volumes = append(volumes, entry.Name)
		}
	}
	return volumes, nil
}

// TrashPut moves an entry into its volume's trash under id, keeping its name, then writes meta
// next to it. If the metadata cannot be written the entry is moved back.
func (r *Resolver) TrashPut(virtual, id string, meta []byte) error {
	clean, err := Clean(virtual)
	if err != nil {
		return err
	}
	volume := VolumeOf(clean)
	if clean == "/" || clean == "/"+volume {
		return ErrVolume
	}
	slot, err := r.trashSlot(volume, id)
	if err != nil {
		return err
	}
	if _, err := r.root.Lstat(Relative(clean)); err != nil {
		return notFound(err)
	}
	if err := r.root.MkdirAll(slot, 0o700); err != nil {
		return fmt.Errorf("trash folder: %w", err)
	}
	inside := slot + "/" + path.Base(clean)
	if err := r.root.Rename(Relative(clean), inside); err != nil {
		_ = r.root.Remove(slot)
		return mapWriteError(err)
	}
	if err := r.root.WriteFile(slot+".json", meta, 0o600); err != nil {
		_ = r.root.Rename(inside, Relative(clean))
		_ = r.root.Remove(slot)
		return fmt.Errorf("trash metadata: %w", err)
	}
	return nil
}

// TrashRestore moves a trashed entry back to a free path (parents are recreated if needed) and
// forgets it. Never replaces an existing entry.
func (r *Resolver) TrashRestore(volume, id, name, to string) error {
	slot, err := r.trashSlot(volume, id)
	if err != nil || !ValidName(name) {
		return ErrInvalidPath
	}
	dst, err := Clean(to)
	if err != nil {
		return err
	}
	exists, err := r.Exists(dst)
	if err != nil {
		return err
	}
	if exists {
		return ErrExists
	}
	if err := r.root.MkdirAll(Relative(path.Dir(dst)), 0o777); err != nil {
		return mapWriteError(err)
	}
	if err := r.root.Rename(slot+"/"+name, Relative(dst)); err != nil {
		return mapWriteError(err)
	}
	_ = r.root.Remove(slot)
	_ = r.root.Remove(slot + ".json")
	return nil
}

// TrashRemove deletes a trashed entry for good.
func (r *Resolver) TrashRemove(volume, id string) error {
	slot, err := r.trashSlot(volume, id)
	if err != nil {
		return err
	}
	if err := r.root.RemoveAll(slot); err != nil {
		return fmt.Errorf("empty trash: %w", err)
	}
	if err := r.root.Remove(slot + ".json"); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return fmt.Errorf("empty trash: %w", err)
	}
	return nil
}

// TrashList returns the metadata of every item in a volume's trash, by id.
func (r *Resolver) TrashList(volume string) (map[string][]byte, error) {
	if volume == "" || !ValidName(volume) || Reserved(volume) {
		return nil, ErrInvalidPath
	}
	dir, err := r.root.Open(volume + "/" + TrashDir)
	if errors.Is(err, fs.ErrNotExist) {
		return map[string][]byte{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("open trash: %w", err)
	}
	defer func() { _ = dir.Close() }()
	names, err := dir.Readdirnames(-1)
	if err != nil {
		return nil, fmt.Errorf("read trash: %w", err)
	}
	items := map[string][]byte{}
	for _, name := range names {
		id, isMeta := strings.CutSuffix(name, ".json")
		if !isMeta || !trashID.MatchString(id) {
			continue
		}
		data, err := r.root.ReadFile(volume + "/" + TrashDir + "/" + name)
		if err != nil {
			continue
		}
		items[id] = data
	}
	return items, nil
}

// TrashMeasure counts the bytes and files of a trashed item (for the trash limits). Links are
// counted as files of their own size and never followed.
func (r *Resolver) TrashMeasure(volume, id string) (bytes, files int64, err error) {
	slot, err := r.trashSlot(volume, id)
	if err != nil {
		return 0, 0, err
	}
	err = fs.WalkDir(r.root.FS(), slot, func(_ string, item fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if item.IsDir() {
			return nil
		}
		info, err := item.Info()
		if err != nil {
			return nil //nolint:nilerr // vanished: nothing to count
		}
		bytes += info.Size()
		files++
		return nil
	})
	if err != nil {
		return 0, 0, fmt.Errorf("measure trash: %w", err)
	}
	return bytes, files, nil
}

// TrashSetMeta rewrites a trashed item's metadata (once measured).
func (r *Resolver) TrashSetMeta(volume, id string, meta []byte) error {
	slot, err := r.trashSlot(volume, id)
	if err != nil {
		return err
	}
	if err := r.root.WriteFile(slot+".json", meta, 0o600); err != nil {
		return fmt.Errorf("trash metadata: %w", err)
	}
	return nil
}
