// Package foldersize is the folder_size job: it adds up what a person may read under a folder.
package foldersize

import (
	"context"
	"fmt"
	"io/fs"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/authz"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/fsx"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/jobs"
)

// Kind names the job in River and engine.jobs.
const Kind = "folder_size"

// Args are stored by River; the subject is captured when the job is requested.
type Args struct {
	Job     string        `json:"jobId"`
	Path    string        `json:"path"`
	Subject authz.Subject `json:"subject"`
}

// Kind implements river.JobArgs.
func (Args) Kind() string { return Kind }

// JobID implements jobs.Args.
func (a Args) JobID() string { return a.Job }

// Walker walks the managed tree (an fsx.Resolver).
type Walker interface {
	Walk(virtual string, visit func(path string, entry fsx.Entry) error) error
}

// Grants loads the rules that may apply to the subject.
type Grants interface {
	GrantsFor(ctx context.Context, subject authz.Subject) ([]authz.Grant, error)
}

// Tally is the running count; folders the subject may not enter are skipped, not counted.
type Tally struct {
	Bytes   int64
	Files   int64
	Folders int64
	Skipped int64
}

// Add counts one visited entry and reports whether to descend into it (folders only).
func (t *Tally) Add(grants []authz.Grant, subject authz.Subject, root, path string, entry fsx.Entry) bool {
	if entry.IsDir {
		if path != root && !authz.MayTraverse(grants, subject, path) {
			t.Skipped++
			return false
		}
		if path != root {
			t.Folders++
		}
		return true
	}
	if !authz.Allowed(grants, subject, path, "read") {
		t.Skipped++
		return true
	}
	t.Files++
	t.Bytes += entry.Size
	return true
}

// Result is the human-readable outcome stored on the job.
func (t *Tally) Result() map[string]any {
	return map[string]any{"bytes": t.Bytes, "files": t.Files, "folders": t.Folders, "skipped": t.Skipped}
}

// Handler measures the folder, reporting progress as it goes.
func Handler(files Walker, store Grants) jobs.Handler[Args] {
	return func(ctx context.Context, args Args, report *jobs.Reporter) (map[string]any, error) {
		var grants []authz.Grant
		if !args.Subject.Admin {
			var err error
			if grants, err = store.GrantsFor(ctx, args.Subject); err != nil {
				return nil, fmt.Errorf("load grants: %w", err)
			}
		}
		var tally Tally
		err := files.Walk(args.Path, func(path string, entry fsx.Entry) error {
			if err := ctx.Err(); err != nil {
				return fmt.Errorf("stopped: %w", err)
			}
			if !tally.Add(grants, args.Subject, args.Path, path, entry) {
				return fs.SkipDir
			}
			return report.Progress(ctx, jobs.Progress{
				BytesDone: tally.Bytes, ItemsDone: tally.Files + tally.Folders, CurrentPath: path,
			})
		})
		if err != nil {
			return tally.Result(), fmt.Errorf("measure folder: %w", err)
		}
		return tally.Result(), nil
	}
}
