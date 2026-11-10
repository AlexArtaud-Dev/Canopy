//go:build !unix

package fsx

import (
	"io/fs"
	"time"
)

// ownership is unknown off Unix (the engine ships in Linux containers).
func ownership(fs.FileInfo) (*Owner, time.Time) {
	return nil, time.Time{}
}
