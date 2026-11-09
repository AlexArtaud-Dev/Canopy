package archive

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"path"
	"strings"
	"time"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/authz"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/fsx"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/jobs"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/transfer"
)

// CompressKind names the job.
const CompressKind = "compress"

// CompressArgs are stored by River; sources share Folder, where the archive is written.
type CompressArgs struct {
	Job     string        `json:"jobId"`
	Sources []string      `json:"sources"`
	Folder  string        `json:"folder"`
	Format  Format        `json:"format"`
	Subject authz.Subject `json:"subject"`
}

// Kind implements river.JobArgs.
func (CompressArgs) Kind() string { return CompressKind }

// JobID implements jobs.Args.
func (a CompressArgs) JobID() string { return a.Job }

// member is one entry going into the archive, named relative to the folder.
type member struct {
	path  string
	name  string
	entry fsx.Entry
}

// CompressHandler writes the archive next to the sources. What the person may not read is left
// out; links are never followed. A failed or cancelled job leaves no partial archive.
func CompressHandler(files Files, grants transfer.Grants) jobs.Handler[CompressArgs] {
	return func(ctx context.Context, args CompressArgs, report *jobs.Reporter) (map[string]any, error) {
		access, err := transfer.LoadAccess(ctx, grants, args.Subject)
		if err != nil {
			return nil, err //nolint:wrapcheck // already says what failed
		}
		members, total, skipped, err := collect(ctx, files, access, args)
		if err != nil {
			return nil, err
		}
		if free, known := files.FreeSpace(args.Folder); known && uint64(total) > free { //nolint:gosec // totals are never negative
			return nil, &jobs.Failure{Code: transfer.CodeNoSpace, Err: errors.New("not enough free space")}
		}
		name := FreeName(BaseName(args.Sources), "."+string(args.Format), taken(files, args.Folder))
		target := path.Join(args.Folder, name)
		items := int64(len(members))
		progress := jobs.Progress{BytesTotal: &total, ItemsTotal: &items}
		write := func(out io.Writer) error {
			return writeArchive(meter{ctx: ctx, report: report, progress: &progress}, files, out, args.Format, members)
		}
		if err := files.WriteNew(target, time.Time{}, write); err != nil {
			return nil, err //nolint:wrapcheck // fsx and job errors carry their codes
		}
		return map[string]any{"path": target, "items": items, "bytes": total, "skipped": skipped}, nil
	}
}

// collect lists what goes into the archive and its total size.
func collect(ctx context.Context, files Files, access transfer.Access, args CompressArgs) ([]member, int64, int64, error) {
	var members []member
	var total, skipped int64
	for _, source := range args.Sources {
		err := files.Walk(source, func(current string, entry fsx.Entry) error {
			if err := ctx.Err(); err != nil {
				return fmt.Errorf("stopped: %w", err)
			}
			if entry.IsLink || !access.CanRead(current, entry.IsDir) {
				skipped++
				if entry.IsDir {
					return fs.SkipDir
				}
				return nil
			}
			members = append(members, member{path: current, name: strings.TrimPrefix(current, strings.TrimSuffix(args.Folder, "/")+"/"), entry: entry})
			total += entry.Size
			return nil
		})
		if errors.Is(err, fsx.ErrNotDir) {
			// A single file: Walk only accepts folders.
			entry, statErr := files.Lstat(source)
			if statErr != nil {
				return nil, 0, 0, statErr //nolint:wrapcheck // fsx errors carry their codes
			}
			if entry.IsLink || !access.CanRead(source, false) {
				skipped++
				continue
			}
			members = append(members, member{path: source, name: path.Base(source), entry: entry})
			total += entry.Size
			continue
		}
		if err != nil {
			return nil, 0, 0, err //nolint:wrapcheck // fsx errors carry their codes
		}
	}
	return members, total, skipped, nil
}

func writeArchive(m meter, files Files, out io.Writer, format Format, members []member) error {
	if format == Zip {
		return writeZip(m, files, out, members)
	}
	return writeTarGz(m, files, out, members)
}

func writeZip(m meter, files Files, out io.Writer, members []member) error {
	archive := zip.NewWriter(out)
	for _, item := range members {
		header := &zip.FileHeader{Name: item.name, Method: zip.Deflate, Modified: item.entry.Modified}
		if item.entry.IsDir {
			header.Name += "/"
			header.SetMode(fs.ModeDir | 0o755)
		} else {
			header.SetMode(0o644)
		}
		writer, err := archive.CreateHeader(header)
		if err != nil {
			return fmt.Errorf("add %s: %w", item.name, err)
		}
		if err := copyMember(m, files, writer, item); err != nil {
			return err
		}
	}
	if err := archive.Close(); err != nil {
		return fmt.Errorf("finish zip: %w", err)
	}
	return nil
}

func writeTarGz(m meter, files Files, out io.Writer, members []member) error {
	compressed := gzip.NewWriter(out)
	archive := tar.NewWriter(compressed)
	for _, item := range members {
		header := &tar.Header{
			Name: item.name, ModTime: item.entry.Modified, Format: tar.FormatPAX,
			Typeflag: tar.TypeReg, Mode: 0o644, Size: item.entry.Size,
		}
		if item.entry.IsDir {
			header.Name += "/"
			header.Typeflag, header.Mode, header.Size = tar.TypeDir, 0o755, 0
		}
		if err := archive.WriteHeader(header); err != nil {
			return fmt.Errorf("add %s: %w", item.name, err)
		}
		if err := copyMember(m, files, archive, item); err != nil {
			return err
		}
	}
	if err := archive.Close(); err != nil {
		return fmt.Errorf("finish tar: %w", err)
	}
	if err := compressed.Close(); err != nil {
		return fmt.Errorf("finish gzip: %w", err)
	}
	return nil
}

// errChanged: a file's size changed between listing and reading (tar headers declare sizes).
var errChanged = errors.New("a file changed while it was archived")

func copyMember(m meter, files Files, out io.Writer, item member) error {
	m.progress.ItemsDone++
	m.progress.CurrentPath = item.path
	if item.entry.IsDir {
		return m.add(0)
	}
	file, _, err := files.OpenFile(item.path)
	if err != nil {
		return err //nolint:wrapcheck // fsx errors carry their codes
	}
	defer func() { _ = file.Close() }()
	copied, err := io.Copy(out, io.LimitReader(meteredReader{Reader: file, meter: m}, item.entry.Size))
	if err != nil {
		return fmt.Errorf("archive %s: %w", item.name, err)
	}
	if copied != item.entry.Size {
		return errChanged
	}
	return nil
}
