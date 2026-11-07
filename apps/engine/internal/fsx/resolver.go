package fsx

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"time"
)

// Resolver serves the managed tree through an os.Root: symlinks and ".." that would leave the
// root fail by construction, whatever the virtual path says.
type Resolver struct {
	root *os.Root
}

// OpenResolver opens the configured root directory.
func OpenResolver(dir string) (*Resolver, error) {
	root, err := os.OpenRoot(dir)
	if err != nil {
		return nil, fmt.Errorf("open root: %w", err)
	}
	return &Resolver{root: root}, nil
}

// Close releases the root handle.
func (r *Resolver) Close() error {
	if err := r.root.Close(); err != nil {
		return fmt.Errorf("close root: %w", err)
	}
	return nil
}

// Entry describes one item without ever exposing its host path.
type Entry struct {
	Name     string
	IsDir    bool
	Size     int64
	Modified time.Time
}

// ErrNotFound is returned when the virtual path does not exist (or escapes the root).
var ErrNotFound = errors.New("not found")

// ErrNotDir is returned when a directory was expected.
var ErrNotDir = errors.New("not a directory")

// Stat describes one virtual path.
func (r *Resolver) Stat(virtual string) (Entry, error) {
	clean, err := Clean(virtual)
	if err != nil {
		return Entry{}, err
	}
	info, err := r.root.Stat(Relative(clean))
	if err != nil {
		return Entry{}, notFound(err)
	}
	return toEntry(clean, info), nil
}

// ReadDir lists a directory's direct children (unsorted; callers sort and paginate).
func (r *Resolver) ReadDir(virtual string) ([]Entry, error) {
	clean, err := Clean(virtual)
	if err != nil {
		return nil, err
	}
	dir, err := r.root.Open(Relative(clean))
	if err != nil {
		return nil, notFound(err)
	}
	defer func() { _ = dir.Close() }()
	info, err := dir.Stat()
	if err != nil {
		return nil, notFound(err)
	}
	if !info.IsDir() {
		return nil, ErrNotDir
	}
	items, err := dir.ReadDir(-1)
	if err != nil {
		return nil, fmt.Errorf("read dir: %w", err)
	}
	entries := make([]Entry, 0, len(items))
	for _, item := range items {
		itemInfo, err := item.Info()
		if err != nil {
			// Vanished between listing and stat: skip rather than fail the whole listing.
			continue
		}
		entries = append(entries, toEntry(item.Name(), itemInfo))
	}
	return entries, nil
}

func toEntry(name string, info fs.FileInfo) Entry {
	if name == "/" || name == "" {
		name = "/"
	} else if i := lastSlash(name); i >= 0 {
		name = name[i+1:]
	}
	size := info.Size()
	if info.IsDir() {
		size = 0
	}
	return Entry{Name: name, IsDir: info.IsDir(), Size: size, Modified: info.ModTime().UTC()}
}

func lastSlash(value string) int {
	for i := len(value) - 1; i >= 0; i-- {
		if value[i] == '/' {
			return i
		}
	}
	return -1
}

// notFound hides why a path is unreachable (missing, escaping, permission): callers only learn
// that it is not there.
func notFound(err error) error {
	return fmt.Errorf("%w: %w", ErrNotFound, err)
}
