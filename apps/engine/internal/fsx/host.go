package fsx

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// ErrOutsideRoot means a path leads out of the root once symbolic links are followed.
var ErrOutsideRoot = errors.New("path leaves the root")

// HostPath is the host path handed to an external tool (catalog commands), which cannot use the
// confined handle. The existing part of the path is resolved with its links followed and must
// stay inside the root; what does not exist yet (a destination) is appended under it.
func (r *Resolver) HostPath(virtual string) (string, error) {
	clean, err := Clean(virtual)
	if err != nil {
		return "", err
	}
	base, err := filepath.EvalSymlinks(r.root.Name())
	if err != nil {
		return "", fmt.Errorf("resolve root: %w", err)
	}
	existing := filepath.Join(base, filepath.FromSlash(Relative(clean)))
	var missing []string
	for {
		if _, err := os.Lstat(existing); err == nil {
			break
		}
		parent := filepath.Dir(existing)
		if parent == existing || !within(parent, base) {
			return "", ErrNotFound
		}
		missing = append([]string{filepath.Base(existing)}, missing...)
		existing = parent
	}
	resolved, err := filepath.EvalSymlinks(existing)
	if err != nil {
		return "", fmt.Errorf("resolve path: %w", err)
	}
	if !within(resolved, base) {
		return "", ErrOutsideRoot
	}
	return filepath.Join(append([]string{resolved}, missing...)...), nil
}

func within(path, base string) bool {
	return path == base || strings.HasPrefix(path, base+string(filepath.Separator))
}
