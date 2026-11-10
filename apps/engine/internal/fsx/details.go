package fsx

import (
	"io/fs"
	"path"
	"path/filepath"
	"time"
)

// Owner is the numeric owner of an entry on the host (names would only be those of the
// container, so they are not looked up).
type Owner struct {
	UID, GID uint32
}

// Details is what the Properties dialog shows beyond a listing, read without following a final
// symbolic link.
type Details struct {
	// Mode holds the type and permission bits as the host reports them.
	Mode fs.FileMode
	// Owner is nil where the platform has no numeric owners.
	Owner *Owner
	// Changed is the last metadata change (zero when unknown).
	Changed time.Time
	// LinkTarget is a symbolic link's target when relative. Absolute targets name host paths,
	// which never leave the engine, so they stay empty.
	LinkTarget string
}

// Describe reads the host details of one virtual path.
func (r *Resolver) Describe(virtual string) (Details, error) {
	clean, err := Clean(virtual)
	if err != nil {
		return Details{}, err
	}
	info, err := r.root.Lstat(Relative(clean))
	if err != nil {
		return Details{}, notFound(err)
	}
	details := Details{Mode: info.Mode()}
	details.Owner, details.Changed = ownership(info)
	if info.Mode()&fs.ModeSymlink != 0 {
		target, err := r.root.Readlink(Relative(clean))
		if err == nil {
			details.LinkTarget = relativeTarget(target)
		}
	}
	return details, nil
}

// relativeTarget keeps a link target only when it is relative (slash-separated).
func relativeTarget(target string) string {
	if target == "" || filepath.IsAbs(target) || path.IsAbs(filepath.ToSlash(target)) {
		return ""
	}
	return filepath.ToSlash(target)
}
