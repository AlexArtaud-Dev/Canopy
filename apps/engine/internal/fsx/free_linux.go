//go:build linux

package fsx

import "syscall"

// FreeSpace reports the bytes available to unprivileged writers on the filesystem holding the
// directory. The directory is opened through the root, so the check stays confined.
func (r *Resolver) FreeSpace(virtual string) (uint64, bool) {
	clean, err := Clean(virtual)
	if err != nil {
		return 0, false
	}
	dir, err := r.root.Open(Relative(clean))
	if err != nil {
		return 0, false
	}
	defer func() { _ = dir.Close() }()
	var stat syscall.Statfs_t
	if err := syscall.Fstatfs(int(dir.Fd()), &stat); err != nil { //nolint:gosec // descriptors fit in int
		return 0, false
	}
	return stat.Bavail * uint64(stat.Bsize), true //nolint:gosec // block size is positive
}
