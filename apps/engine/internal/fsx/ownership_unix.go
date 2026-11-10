//go:build unix

package fsx

import (
	"io/fs"
	"syscall"
	"time"
)

// ownership reads the numeric owner and the change time from the host's stat data.
func ownership(info fs.FileInfo) (*Owner, time.Time) {
	stat, ok := info.Sys().(*syscall.Stat_t)
	if !ok {
		return nil, time.Time{}
	}
	return &Owner{UID: stat.Uid, GID: stat.Gid}, changeTime(stat)
}
