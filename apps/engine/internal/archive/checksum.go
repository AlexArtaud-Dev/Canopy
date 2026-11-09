package archive

import (
	"context"
	"crypto/md5"  //nolint:gosec // offered to compare with published MD5 sums, not for security
	"crypto/sha1" //nolint:gosec // offered to compare with published SHA-1 sums, not for security
	"crypto/sha256"
	"crypto/sha512"
	"encoding/hex"
	"fmt"
	"hash"
	"io"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/authz"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/jobs"
)

// ChecksumKind names the job.
const ChecksumKind = "checksum"

// ChecksumArgs are stored by River.
type ChecksumArgs struct {
	Job       string        `json:"jobId"`
	Path      string        `json:"path"`
	Algorithm string        `json:"algorithm"`
	Subject   authz.Subject `json:"subject"`
}

// Kind implements river.JobArgs.
func (ChecksumArgs) Kind() string { return ChecksumKind }

// JobID implements jobs.Args.
func (a ChecksumArgs) JobID() string { return a.Job }

// NewHash returns the hash for a valid algorithm (SHA-256 otherwise).
func NewHash(algorithm string) hash.Hash {
	switch algorithm {
	case MD5:
		return md5.New() //nolint:gosec // see the import
	case SHA1:
		return sha1.New() //nolint:gosec // see the import
	case SHA512:
		return sha512.New()
	default:
		return sha256.New()
	}
}

// ChecksumHandler hashes one file, reporting progress; the result carries the hex digest.
func ChecksumHandler(files Files) jobs.Handler[ChecksumArgs] {
	return func(ctx context.Context, args ChecksumArgs, report *jobs.Reporter) (map[string]any, error) {
		file, entry, err := files.OpenFile(args.Path)
		if err != nil {
			return nil, err //nolint:wrapcheck // fsx errors carry their codes
		}
		defer func() { _ = file.Close() }()
		size := entry.Size
		progress := jobs.Progress{BytesTotal: &size, CurrentPath: args.Path}
		digest := NewHash(args.Algorithm)
		source := meteredReader{Reader: file, meter: meter{ctx: ctx, report: report, progress: &progress}}
		if _, err := io.Copy(digest, source); err != nil {
			return nil, fmt.Errorf("hash: %w", err)
		}
		return map[string]any{
			"algorithm": args.Algorithm, "hash": hex.EncodeToString(digest.Sum(nil)), "bytes": progress.BytesDone,
		}, nil
	}
}
