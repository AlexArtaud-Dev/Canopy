//go:build linux

package fsx

import (
	"syscall"
	"time"
)

func changeTime(stat *syscall.Stat_t) time.Time {
	return time.Unix(stat.Ctim.Sec, stat.Ctim.Nsec).UTC()
}
