package archive

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"path"
	"time"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/authz"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/fsx"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/jobs"
)

// ExtractKind names the job.
const ExtractKind = "extract"

// ExtractArgs are stored by River.
type ExtractArgs struct {
	Job     string        `json:"jobId"`
	Archive string        `json:"archive"`
	Subject authz.Subject `json:"subject"`
}

// Kind implements river.JobArgs.
func (ExtractArgs) Kind() string { return ExtractKind }

// JobID implements jobs.Args.
func (a ExtractArgs) JobID() string { return a.Job }

// extraction tracks one run: where it writes, what it may still write, and what it did.
type extraction struct {
	files   Files
	dest    string
	budget  int64
	meter   meter
	entries int
	written int64
	folders int64
	created int64
	skipped int64
}

// ExtractHandler unpacks an archive into a new folder next to it. Entry names are checked one by
// one (no absolute paths, no "..", nothing reserved); links and devices are skipped; the entry
// count and the bytes written are capped, the bytes by the free space. A failed or cancelled job
// removes the folder it created.
func ExtractHandler(files Files) jobs.Handler[ExtractArgs] {
	return func(ctx context.Context, args ExtractArgs, report *jobs.Reporter) (map[string]any, error) {
		format := FormatOf(args.Archive)
		if format == None {
			return nil, &jobs.Failure{Code: CodeNotArchive, Err: ErrNotArchive}
		}
		file, entry, err := files.OpenFile(args.Archive)
		if err != nil {
			return nil, err //nolint:wrapcheck // fsx errors carry their codes
		}
		defer func() { _ = file.Close() }()
		parent := path.Dir(args.Archive)
		dest := path.Join(parent, FreeName(Stem(entry.Name), "", taken(files, parent)))
		if err := files.Mkdir(dest); err != nil {
			return nil, err //nolint:wrapcheck // fsx errors carry their codes
		}
		run := &extraction{files: files, dest: dest, budget: budgetOf(files, parent)}
		progress := jobs.Progress{}
		run.meter = meter{ctx: ctx, report: report, progress: &progress}
		if format == Zip {
			err = run.zip(file, entry.Size)
		} else {
			err = run.tar(file, entry.Size, format == TarGz)
		}
		if err != nil {
			_ = files.RemoveAll(dest)
			return nil, coded(err)
		}
		return map[string]any{
			"path": dest, "files": run.created, "folders": run.folders, "bytes": run.written, "skipped": run.skipped,
		}, nil
	}
}

// budgetOf is how much may be written: the free space when known.
func budgetOf(files Files, folder string) int64 {
	if free, known := files.FreeSpace(folder); known && free < math.MaxInt64 {
		return int64(free)
	}
	return math.MaxInt64
}

// coded gives archive problems their error codes; other errors keep theirs.
func coded(err error) error {
	switch {
	case errors.Is(err, ErrBadArchive):
		return &jobs.Failure{Code: CodeBadArchive, Err: err}
	case errors.Is(err, ErrTooLarge):
		return &jobs.Failure{Code: CodeTooLarge, Err: err}
	default:
		return err
	}
}

func (x *extraction) count() error {
	x.entries++
	if x.entries > MaxEntries {
		return ErrTooLarge
	}
	return nil
}

func (x *extraction) zip(file *os.File, size int64) error {
	reader, err := zip.NewReader(file, size)
	if err != nil {
		return fmt.Errorf("%w: %w", ErrBadArchive, err)
	}
	if len(reader.File) > MaxEntries {
		return ErrTooLarge
	}
	var declared uint64
	for _, item := range reader.File {
		declared += item.UncompressedSize64
	}
	if declared > uint64(x.budget) { //nolint:gosec // the budget is never negative
		return ErrTooLarge
	}
	total := int64(declared) //nolint:gosec // bounded by the budget just above
	x.meter.progress.BytesTotal = &total
	for _, item := range reader.File {
		if err := x.zipEntry(item); err != nil {
			return err
		}
	}
	return nil
}

func (x *extraction) zipEntry(item *zip.File) error {
	if err := x.count(); err != nil {
		return err
	}
	target, err := EntryTarget(x.dest, item.Name)
	if err != nil {
		return err
	}
	mode := item.Mode()
	switch {
	case mode.IsDir():
		return x.folder(target)
	case !mode.IsRegular():
		x.skipped++
		return nil
	}
	content, err := item.Open()
	if err != nil {
		return fmt.Errorf("%w: %w", ErrBadArchive, err)
	}
	defer func() { _ = content.Close() }()
	// Zip progress follows the bytes extracted (the total is declared up front).
	return x.file(target, item.Modified, meteredReader{Reader: content, meter: x.meter})
}

func (x *extraction) tar(file *os.File, size int64, gzipped bool) error {
	x.meter.progress.BytesTotal = &size
	// Progress follows the archive bytes read: tar does not declare its total up front.
	var source io.Reader = meteredReader{Reader: file, meter: x.meter}
	if gzipped {
		decompressed, err := gzip.NewReader(source)
		if err != nil {
			return fmt.Errorf("%w: %w", ErrBadArchive, err)
		}
		defer func() { _ = decompressed.Close() }()
		source = decompressed
	}
	reader := tar.NewReader(source)
	for {
		header, err := reader.Next()
		if errors.Is(err, io.EOF) {
			return nil
		}
		if err != nil {
			return fmt.Errorf("%w: %w", ErrBadArchive, err)
		}
		if err := x.tarEntry(header, reader); err != nil {
			return err
		}
	}
}

func (x *extraction) tarEntry(header *tar.Header, content io.Reader) error {
	if err := x.count(); err != nil {
		return err
	}
	// PAX global headers carry metadata only.
	if header.Typeflag == tar.TypeXGlobalHeader {
		return nil
	}
	target, err := EntryTarget(x.dest, header.Name)
	if err != nil {
		return err
	}
	switch header.Typeflag {
	case tar.TypeDir:
		return x.folder(target)
	case tar.TypeReg:
		return x.file(target, header.ModTime, content)
	default:
		x.skipped++
		return nil
	}
}

func (x *extraction) folder(target string) error {
	if err := x.files.MkdirAll(target); err != nil {
		return err //nolint:wrapcheck // fsx errors carry their codes
	}
	x.folders++
	return nil
}

// file writes one extracted file; a name used twice in the archive keeps the first.
func (x *extraction) file(target string, modified time.Time, content io.Reader) error {
	if err := x.files.MkdirAll(path.Dir(target)); err != nil {
		return err //nolint:wrapcheck // fsx errors carry their codes
	}
	x.meter.progress.CurrentPath = target
	x.meter.progress.ItemsDone++
	err := x.files.WriteNew(target, modified, func(out io.Writer) error {
		// One byte more than the budget allows reveals an archive that expands past it.
		remaining := x.budget - x.written
		if remaining < math.MaxInt64 {
			remaining++
		}
		limited := io.LimitReader(content, remaining)
		written, err := io.Copy(out, limited)
		x.written += written
		if err != nil {
			return fmt.Errorf("%w: %w", ErrBadArchive, err)
		}
		if x.written > x.budget {
			return ErrTooLarge
		}
		return x.meter.add(0)
	})
	if errors.Is(err, fsx.ErrExists) {
		x.skipped++
		return nil
	}
	if err != nil {
		return err //nolint:wrapcheck // fsx and archive errors carry their codes
	}
	x.created++
	return nil
}
