package archive

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/fsx"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/jobs"
)

// CodeNothingToCompress means every item was left out (no read access, links, or only empty folders).
const CodeNothingToCompress = "files.nothing_to_compress"

// ErrNothingToCompress is returned when no file can go into a 7z archive.
var ErrNothingToCompress = errors.New("nothing to compress")

// external unpacks a 7z, RAR or ISO archive with 7-Zip. Every entry name is checked against the
// same rules as Canopy's own extractor before anything is written, the totals against the same
// limits; afterwards, links are removed (Canopy never extracts them) and the rest counted.
func (x *extraction) external(ctx context.Context, tool *SevenZip, archive string) error {
	if tool == nil {
		return ErrNoSevenZip
	}
	hostArchive, err := tool.Host(archive)
	if err != nil {
		return fmt.Errorf("archive path: %w", err)
	}
	hostDest, err := tool.Host(x.dest)
	if err != nil {
		return fmt.Errorf("destination path: %w", err)
	}
	entries, err := tool.list(ctx, hostArchive)
	if err != nil {
		return err
	}
	var total int64
	for _, entry := range entries {
		if err := x.count(); err != nil {
			return err
		}
		if _, err := EntryTarget(x.dest, entry.path); err != nil {
			return fmt.Errorf("%w: unsafe entry name", err)
		}
		if !entry.dir && !entry.link {
			total += entry.size
		}
	}
	if total > x.budget {
		return ErrTooLarge
	}
	x.meter.progress.BytesTotal = &total
	argv := []string{"x", "-bsp1", "-bso0", "-bse1", "-y", "-aoa", "-p", "-sccUTF-8", "-o" + hostDest, "--", hostArchive}
	problems, err := tool.run(ctx, "", argv, func(line string) {
		if percent, ok := percentOf(line); ok {
			x.meter.progress.BytesDone = total * percent / 100
			_ = x.meter.report.Progress(ctx, *x.meter.progress)
		}
	})
	if err != nil {
		if ctx.Err() != nil {
			return err
		}
		return failure(problems, err)
	}
	return x.settle()
}

// settle removes links 7-Zip may have created and counts what was extracted.
func (x *extraction) settle() error {
	var links []string
	err := x.files.Walk(x.dest, func(current string, entry fsx.Entry) error {
		switch {
		case current == x.dest:
		case entry.IsLink:
			links = append(links, current)
		case entry.IsDir:
			x.folders++
		default:
			x.created++
			x.written += entry.Size
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("check extracted files: %w", err)
	}
	for _, link := range links {
		if err := x.files.RemoveAll(link); err != nil {
			return fmt.Errorf("remove extracted link: %w", err)
		}
		x.skipped++
	}
	return nil
}

// compressExternal writes a 7z archive of the collected files. Only files are listed (a folder
// name would make 7-Zip add everything below it, including what the person may not read); 7-Zip
// stores links as links (-snl) and never follows them. The archive path is absolute, so it cannot
// read as a switch; "--" would make 7-Zip take the @list as a file name.
func compressExternal(ctx context.Context, tool *SevenZip, m meter, folder, target string, members []member) (int64, error) {
	if tool == nil {
		return 0, ErrNoSevenZip
	}
	var names []string
	for _, item := range members {
		if item.entry.IsDir || strings.ContainsAny(item.name, "\r\n") {
			continue
		}
		names = append(names, item.name)
	}
	if len(names) == 0 {
		return 0, ErrNothingToCompress
	}
	hostFolder, err := tool.Host(folder)
	if err != nil {
		return 0, fmt.Errorf("folder path: %w", err)
	}
	hostTarget, err := tool.Host(target)
	if err != nil {
		return 0, fmt.Errorf("archive path: %w", err)
	}
	list, err := tool.writeList(names)
	if err != nil {
		return 0, err
	}
	defer func() { _ = os.Remove(list) }()
	total := *m.progress.BytesTotal
	argv := []string{"a", "-t7z", "-mx=5", "-snl", "-bsp1", "-bso0", "-bse1", "-y", "-scsUTF-8", "-sccUTF-8", hostTarget, "@" + list}
	problems, err := tool.run(ctx, hostFolder, argv, func(line string) {
		if percent, ok := percentOf(line); ok {
			m.progress.BytesDone = total * percent / 100
			_ = m.report.Progress(ctx, *m.progress)
		}
	})
	if err != nil {
		if ctx.Err() != nil {
			return 0, err
		}
		return 0, &jobs.Failure{Code: CodeBadArchive, Err: fmt.Errorf("%w: %v", err, problems)}
	}
	return int64(len(names)), nil
}
