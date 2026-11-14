//go:build !windows

package metrics

import "syscall"

// DiskUsage measures the filesystem holding path: bytes used and its size.
func DiskUsage(path string) (used, total uint64, err error) {
	var stat syscall.Statfs_t
	if err := syscall.Statfs(path, &stat); err != nil {
		return 0, 0, err
	}
	blockSize := uint64(stat.Bsize) //nolint:gosec // block sizes are small positive numbers.
	total = stat.Blocks * blockSize
	free := stat.Bfree * blockSize
	return total - min(free, total), total, nil
}
