package archive

import (
	"context"
	"fmt"
	"io"
	"os"
	"time"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/fsx"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/jobs"
)

// Files is the slice of fsx.Resolver the archive jobs need.
type Files interface {
	Lstat(virtual string) (fsx.Entry, error)
	Walk(virtual string, visit func(path string, entry fsx.Entry) error) error
	OpenFile(virtual string) (*os.File, fsx.Entry, error)
	Exists(virtual string) (bool, error)
	Mkdir(virtual string) error
	MkdirAll(virtual string) error
	WriteNew(virtual string, modified time.Time, write func(io.Writer) error) error
	RemoveAll(virtual string) error
	FreeSpace(virtual string) (uint64, bool)
}

// taken adapts Exists for FreeName; an unreadable name counts as taken, so it is never reused.
func taken(files Files, folder string) func(string) bool {
	return func(name string) bool {
		exists, err := files.Exists(folder + "/" + name)
		return err != nil || exists
	}
}

// meter counts bytes through a reader or writer and reports progress; it also stops the copy
// as soon as the job is cancelled.
type meter struct {
	ctx      context.Context //nolint:containedctx // lives exactly as long as one job step
	report   *jobs.Reporter
	progress *jobs.Progress
}

func (m meter) add(n int) error {
	if err := m.ctx.Err(); err != nil {
		return fmt.Errorf("stopped: %w", err)
	}
	m.progress.BytesDone += int64(n)
	return m.report.Progress(m.ctx, *m.progress)
}

type meteredReader struct {
	io.Reader
	meter meter
}

func (r meteredReader) Read(buffer []byte) (int, error) {
	n, err := r.Reader.Read(buffer)
	if n > 0 {
		if meterErr := r.meter.add(n); meterErr != nil {
			return n, meterErr
		}
	}
	return n, err //nolint:wrapcheck // io.EOF must stay as is
}
