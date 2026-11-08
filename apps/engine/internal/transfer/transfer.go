package transfer

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"path"
	"slices"
	"strings"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/authz"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/fsx"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/jobs"
)

// Kind names the job in River and engine.jobs.
const Kind = "transfer"

// maxConflicts bounds the pre-scan answer; the job still applies the strategy everywhere.
const maxConflicts = 500

// Files is the slice of fsx.Resolver a transfer needs.
type Files interface {
	Lstat(virtual string) (fsx.Entry, error)
	ReadDir(virtual string) ([]fsx.Entry, error)
	Walk(virtual string, visit func(path string, entry fsx.Entry) error) error
	Exists(virtual string) (bool, error)
	Mkdir(virtual string) error
	Rename(from, to string) error
	CopyFile(ctx context.Context, from, to string, overwrite bool, progress func(int64)) error
	RemoveAll(virtual string) error
	RemoveEmptyDir(virtual string) error
	FreeSpace(virtual string) (uint64, bool)
}

// Grants loads the rules that may apply to the subject.
type Grants interface {
	GrantsFor(ctx context.Context, subject authz.Subject) ([]authz.Grant, error)
}

// Access answers per-path questions for one subject.
type Access struct {
	Grants  []authz.Grant
	Subject authz.Subject
}

// CanRead reports folders the subject may enter (possibly for a deeper rule) and files they may
// read.
func (a Access) CanRead(virtual string, isDir bool) bool {
	if isDir {
		return authz.MayTraverse(a.Grants, a.Subject, virtual)
	}
	return authz.Allowed(a.Grants, a.Subject, virtual, "read")
}

// Can checks one action on one path.
func (a Access) Can(action, virtual string) bool {
	return authz.Allowed(a.Grants, a.Subject, virtual, action)
}

// LoadAccess loads the subject's grants (administrators need none).
func LoadAccess(ctx context.Context, grants Grants, subject authz.Subject) (Access, error) {
	access := Access{Subject: subject}
	if subject.Admin {
		return access, nil
	}
	loaded, err := grants.GrantsFor(ctx, subject)
	if err != nil {
		return Access{}, fmt.Errorf("load grants: %w", err)
	}
	access.Grants = loaded
	return access, nil
}

// Conflict is a target that already exists.
type Conflict struct {
	Source      string
	Target      string
	SourceIsDir bool
	TargetIsDir bool
	// Self is a copy onto itself (same folder): only "keep both" applies.
	Self bool
}

// children lists what the subject may read in a folder, in name order (deterministic runs).
func children(files Files, access Access, dir string) ([]fsx.Entry, error) {
	entries, err := files.ReadDir(dir)
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", dir, err)
	}
	visible := entries[:0]
	for _, entry := range entries {
		if access.CanRead(path.Join(dir, entry.Name), entry.IsDir) {
			visible = append(visible, entry)
		}
	}
	slices.SortFunc(visible, func(a, b fsx.Entry) int { return strings.Compare(a.Name, b.Name) })
	return visible, nil
}

// FindConflicts lists targets that already exist, descending into folders that would merge, so
// the person can choose a strategy (or one per item) before anything is written.
func FindConflicts(files Files, access Access, sources []string, destination string) ([]Conflict, bool, error) {
	var found []Conflict
	truncated := false
	var visit func(src, dst string, entry fsx.Entry) error
	visit = func(src, dst string, entry fsx.Entry) error {
		if len(found) >= maxConflicts {
			truncated = true
			return nil
		}
		target, err := files.Lstat(dst)
		if errors.Is(err, fsx.ErrNotFound) {
			return nil
		}
		if err != nil {
			return fmt.Errorf("check %s: %w", dst, err)
		}
		found = append(found, Conflict{
			Source: src, Target: dst, SourceIsDir: entry.IsDir, TargetIsDir: target.IsDir, Self: src == dst,
		})
		if src == dst || !mergeable(entry, target) {
			return nil
		}
		items, err := children(files, access, src)
		if err != nil {
			return err
		}
		for _, child := range items {
			if err := visit(path.Join(src, child.Name), path.Join(dst, child.Name), child); err != nil {
				return err
			}
		}
		return nil
	}
	for _, src := range sources {
		entry, err := files.Lstat(src)
		if err != nil {
			return nil, false, fmt.Errorf("source %s: %w", src, err)
		}
		if err := visit(src, TargetPath(destination, src), entry); err != nil {
			return nil, false, err
		}
	}
	return found, truncated, nil
}

func mergeable(source, target fsx.Entry) bool {
	return source.IsDir && target.IsDir && !source.IsLink && !target.IsLink
}

// Args are stored by River; the subject is captured when the transfer is requested.
type Args struct {
	Job         string            `json:"jobId"`
	Operation   string            `json:"operation"`
	Sources     []string          `json:"sources"`
	Destination string            `json:"destination"`
	Strategy    string            `json:"strategy"`
	Decisions   map[string]string `json:"decisions,omitempty"`
	Subject     authz.Subject     `json:"subject"`
}

// Kind implements river.JobArgs.
func (Args) Kind() string { return Kind }

// JobID implements jobs.Args.
func (a Args) JobID() string { return a.Job }

// Label implements jobs.Labeled: people see a copy or a move, not a "transfer".
func (a Args) Label() string { return a.Operation }

// Handler runs a copy or move: totals first (for progress and the space check), then each source.
func Handler(files Files, grants Grants) jobs.Handler[Args] {
	return func(ctx context.Context, args Args, report *jobs.Reporter) (map[string]any, error) {
		access, err := LoadAccess(ctx, grants, args.Subject)
		if err != nil {
			return nil, err
		}
		run := &runner{ctx: ctx, files: files, access: access, args: args, report: report}
		if err := run.measure(); err != nil {
			return nil, err
		}
		if args.Operation == OpCopy {
			if free, known := files.FreeSpace(args.Destination); known && uint64(*run.progress.BytesTotal) > free { //nolint:gosec // totals are never negative
				return nil, &jobs.Failure{Code: CodeNoSpace, Err: errors.New("not enough free space")}
			}
		}
		for _, src := range args.Sources {
			entry, err := files.Lstat(src)
			if err != nil {
				return run.result(), &jobs.Failure{Code: fsx.CodeNotFound, Err: err}
			}
			if err := run.place(src, TargetPath(args.Destination, src), entry); err != nil {
				return run.result(), err
			}
		}
		return run.result(), nil
	}
}

type runner struct {
	ctx      context.Context //nolint:containedctx // one runner lives exactly as long as its job
	files    Files
	access   Access
	args     Args
	report   *jobs.Reporter
	progress jobs.Progress
	skipped  int64
	renamed  int64
}

func (r *runner) result() map[string]any {
	return map[string]any{
		"items": r.progress.ItemsDone, "bytes": r.progress.BytesDone,
		"skipped": r.skipped, "renamed": r.renamed,
	}
}

// measure counts what the subject may read under every source.
func (r *runner) measure() error {
	var items, bytes int64
	for _, src := range r.args.Sources {
		err := r.files.Walk(src, func(p string, entry fsx.Entry) error {
			if err := r.ctx.Err(); err != nil {
				return fmt.Errorf("stopped: %w", err)
			}
			if p != src && !r.access.CanRead(p, entry.IsDir) {
				if entry.IsDir {
					return fs.SkipDir
				}
				return nil
			}
			items++
			bytes += entry.Size
			return nil
		})
		if errors.Is(err, fsx.ErrNotDir) {
			// A single file: Walk only accepts folders.
			entry, statErr := r.files.Lstat(src)
			if statErr != nil {
				return &jobs.Failure{Code: fsx.CodeNotFound, Err: statErr}
			}
			items++
			bytes += entry.Size
			continue
		}
		if errors.Is(err, fsx.ErrNotFound) {
			return &jobs.Failure{Code: fsx.CodeNotFound, Err: err}
		}
		if err != nil {
			return err
		}
	}
	r.progress.ItemsTotal = &items
	r.progress.BytesTotal = &bytes
	return r.publish("")
}

func (r *runner) publish(current string) error {
	r.progress.CurrentPath = current
	return r.report.Progress(r.ctx, r.progress)
}

func (r *runner) skip() {
	r.skipped++
	r.progress.ItemsDone++
}

// place puts one entry at dst, applying the conflict strategy when dst is taken.
func (r *runner) place(src, dst string, entry fsx.Entry) error {
	if err := r.ctx.Err(); err != nil {
		return fmt.Errorf("stopped: %w", err)
	}
	target, err := r.files.Lstat(dst)
	switch {
	case errors.Is(err, fsx.ErrNotFound):
		return r.fresh(src, dst, entry)
	case err != nil:
		return fmt.Errorf("check %s: %w", dst, err)
	}
	strategy := StrategyFor(r.args.Decisions, r.args.Strategy, dst)
	if src == dst {
		strategy = StrategyKeepBoth
	}
	switch strategy {
	case StrategyKeepBoth:
		dir := path.Dir(dst)
		name := KeepBothName(path.Base(dst), entry.IsDir, func(candidate string) bool {
			// A failed check reads as free: the write that follows then reports the real error.
			taken, err := r.files.Exists(path.Join(dir, candidate))
			return err == nil && taken
		})
		r.renamed++
		return r.fresh(src, path.Join(dir, name), entry)
	case StrategyOverwrite:
		return r.overwrite(src, dst, entry, target)
	default:
		r.skip()
		return nil
	}
}

// overwrite merges folders into folders and replaces files by files; anything else is skipped.
func (r *runner) overwrite(src, dst string, entry, target fsx.Entry) error {
	if entry.IsDir != target.IsDir || entry.IsLink || target.IsLink || !r.access.Can("update", dst) {
		r.skip()
		return nil
	}
	if entry.IsDir {
		return r.descend(src, dst)
	}
	if r.args.Operation == OpMove {
		if err := r.files.RemoveAll(dst); err != nil {
			return err
		}
		return r.move(src, dst, entry)
	}
	return r.copyFile(src, dst, entry, true)
}

// fresh handles a free target.
func (r *runner) fresh(src, dst string, entry fsx.Entry) error {
	if r.args.Operation == OpMove {
		return r.move(src, dst, entry)
	}
	if entry.IsLink {
		r.skip()
		return nil
	}
	if !entry.IsDir {
		return r.copyFile(src, dst, entry, false)
	}
	if err := r.files.Mkdir(dst); err != nil {
		return err
	}
	r.progress.ItemsDone++
	return r.descend(src, dst)
}

// move renames when possible; across filesystems it copies, verifies and deletes item by item, so
// anything skipped (no access, conflict) stays in place.
func (r *runner) move(src, dst string, entry fsx.Entry) error {
	err := r.files.Rename(src, dst)
	switch {
	case err == nil:
		r.progress.ItemsDone++
		r.progress.BytesDone += entry.Size
		return r.publish(src)
	case !errors.Is(err, fsx.ErrCrossDevice):
		return err
	}
	if !entry.IsDir {
		if err := r.copyFile(src, dst, entry, false); err != nil {
			return err
		}
		return r.files.RemoveAll(src)
	}
	if err := r.files.Mkdir(dst); err != nil && !errors.Is(err, fsx.ErrExists) {
		return err
	}
	r.progress.ItemsDone++
	return r.descend(src, dst)
}

// descend places every readable child; a moved folder is removed once emptied.
func (r *runner) descend(src, dst string) error {
	items, err := children(r.files, r.access, src)
	if err != nil {
		return err
	}
	for _, child := range items {
		if err := r.place(path.Join(src, child.Name), path.Join(dst, child.Name), child); err != nil {
			return err
		}
	}
	if r.args.Operation == OpMove {
		// Fails, on purpose, when something was skipped and is still inside.
		_ = r.files.RemoveEmptyDir(src)
	}
	return nil
}

func (r *runner) copyFile(src, dst string, entry fsx.Entry, overwrite bool) error {
	err := r.files.CopyFile(r.ctx, src, dst, overwrite, func(n int64) {
		r.progress.BytesDone += n
		r.progress.CurrentPath = src
		_ = r.report.Progress(r.ctx, r.progress)
	})
	if errors.Is(err, fsx.ErrNotRegular) {
		r.skip()
		return nil
	}
	if err != nil {
		return err
	}
	copied, err := r.files.Lstat(dst)
	if err != nil || copied.Size != entry.Size {
		return &jobs.Failure{Code: CodeVerifyFailed, Err: fmt.Errorf("size mismatch for %s", dst)}
	}
	r.progress.ItemsDone++
	return r.publish(src)
}
