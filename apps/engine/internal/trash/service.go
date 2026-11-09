package trash

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"path"
	"slices"
	"time"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/audit"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/authz"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/fsx"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/jobs"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/transfer"
)

// planBudget bounds how long a delete plan may measure before answering "not complete".
const planBudget = 2 * time.Second

var (
	// ErrForbidden refuses an item the person may not delete (or restore).
	ErrForbidden = errors.New("forbidden")
	// ErrNotFound refuses an unknown or foreign trash item.
	ErrNotFound = errors.New("trash item not found")
	errBudget   = errors.New("measuring budget spent")
)

// Files is the slice of fsx.Resolver the trash needs.
type Files interface {
	Lstat(virtual string) (fsx.Entry, error)
	Exists(virtual string) (bool, error)
	Walk(virtual string, visit func(path string, entry fsx.Entry) error) error
	RemoveAll(virtual string) error
	Volumes() ([]string, error)
	TrashPut(virtual, id string, meta []byte) error
	TrashRestore(volume, id, name, to string) error
	TrashRemove(volume, id string) error
	TrashList(volume string) (map[string][]byte, error)
	TrashMeasure(volume, id string) (int64, int64, error)
	TrashSetMeta(volume, id string, meta []byte) error
}

// Auditor records trash changes.
type Auditor interface {
	Record(ctx context.Context, event audit.Event) error
}

// Config wires the service.
type Config struct {
	Files  Files
	Grants transfer.Grants
	Audit  Auditor
	Limits func(ctx context.Context) (Limits, error)
	Logger *slog.Logger
	Now    func() time.Time
}

// Service is the trash: delete, list, restore, and the keeper enforcing limits.
type Service struct {
	cfg  Config
	kick chan struct{}
}

// New builds the service; call Keep to run the keeper.
func New(cfg Config) *Service {
	return &Service{cfg: cfg, kick: make(chan struct{}, 1)}
}

// Item is a trashed entry as people see it.
type Item = Meta

func (s *Service) record(ctx context.Context, actor, action, target, requestID string, meta map[string]any) {
	err := s.cfg.Audit.Record(ctx, audit.Event{
		ActorID: actor, Action: action, Target: target, Result: audit.ResultSuccess, RequestID: requestID, Meta: meta,
	})
	if err != nil {
		s.cfg.Logger.Error("audit write failed", slog.String("action", action), slog.Any("error", err))
	}
}

// checkDeletable validates paths and the `delete` permission before anything moves.
func (s *Service) checkDeletable(ctx context.Context, subject authz.Subject, paths []string) ([]string, error) {
	access, err := transfer.LoadAccess(ctx, s.cfg.Grants, subject)
	if err != nil {
		return nil, err //nolint:wrapcheck // answered as an internal error
	}
	if len(paths) == 0 {
		return nil, fsx.ErrInvalidPath
	}
	cleaned := make([]string, 0, len(paths))
	for _, raw := range paths {
		clean, err := fsx.Clean(raw)
		if err != nil {
			return nil, err //nolint:wrapcheck // classified by the caller
		}
		if clean == "/" || clean == "/"+fsx.VolumeOf(clean) {
			return nil, fsx.ErrVolume
		}
		if _, err := s.cfg.Files.Lstat(clean); err != nil {
			return nil, err //nolint:wrapcheck // classified by the caller
		}
		if !access.Can("delete", clean) {
			return nil, ErrForbidden
		}
		cleaned = append(cleaned, clean)
	}
	return cleaned, nil
}

// Plan is what deleting would touch, so the web app can warn before permanent deletion.
type Plan struct {
	Bytes    int64
	Files    int64
	Complete bool
	// FitsTrash is false when the selection alone exceeds the trash limits: the web app then
	// offers a permanent delete with a strong warning instead.
	FitsTrash bool
}

// PlanDelete measures the selection within a time budget.
func (s *Service) PlanDelete(ctx context.Context, subject authz.Subject, paths []string) (Plan, error) {
	cleaned, err := s.checkDeletable(ctx, subject, paths)
	if err != nil {
		return Plan{}, err
	}
	limits, err := s.cfg.Limits(ctx)
	if err != nil {
		return Plan{}, err
	}
	deadline := s.cfg.Now().Add(planBudget)
	plan := Plan{Complete: true}
	for _, clean := range cleaned {
		entry, _ := s.cfg.Files.Lstat(clean)
		if !entry.IsDir {
			plan.Bytes += entry.Size
			plan.Files++
			continue
		}
		err := s.cfg.Files.Walk(clean, func(_ string, item fsx.Entry) error {
			if s.cfg.Now().After(deadline) {
				return errBudget
			}
			if !item.IsDir {
				plan.Bytes += item.Size
				plan.Files++
			}
			return nil
		})
		if errors.Is(err, errBudget) {
			plan.Complete = false
			break
		}
		if err != nil {
			return Plan{}, err //nolint:wrapcheck // classified by the caller
		}
	}
	plan.FitsTrash = plan.Complete && Fits(plan.Bytes, plan.Files, limits)
	return plan, nil
}

// Delete moves items to their volume's trash (instant renames) and wakes the keeper.
func (s *Service) Delete(ctx context.Context, subject authz.Subject, paths []string, requestID string) ([]Item, error) {
	cleaned, err := s.checkDeletable(ctx, subject, paths)
	if err != nil {
		return nil, err
	}
	items := make([]Item, 0, len(cleaned))
	for _, clean := range cleaned {
		entry, err := s.cfg.Files.Lstat(clean)
		if err != nil {
			return items, err //nolint:wrapcheck // classified by the caller
		}
		id, err := fsx.NewVolumeID(fsx.VolumeOf(clean))
		if err != nil {
			return items, err //nolint:wrapcheck // internal error
		}
		item := Item{
			ID: id, Name: path.Base(clean), OriginalPath: clean, IsDir: entry.IsDir,
			DeletedAt: s.cfg.Now().UTC(), DeletedBy: subject.UserID,
		}
		if !entry.IsDir {
			item.Bytes, item.Files, item.Measured = entry.Size, 1, true
		}
		encoded, err := json.Marshal(item)
		if err != nil {
			return items, fmt.Errorf("encode trash item: %w", err)
		}
		if err := s.cfg.Files.TrashPut(clean, id, encoded); err != nil {
			return items, err //nolint:wrapcheck // classified by the caller
		}
		s.record(ctx, subject.UserID, "fs.delete", clean, requestID, map[string]any{"trash": true, "id": id})
		items = append(items, item)
	}
	s.Kick()
	return items, nil
}

// List returns the items a person may see, newest first.
func (s *Service) List(_ context.Context, subject authz.Subject) ([]Item, error) {
	volumes, err := s.cfg.Files.Volumes()
	if err != nil {
		return nil, err //nolint:wrapcheck // internal error
	}
	var items []Item
	for _, volume := range volumes {
		metas, err := s.volumeItems(volume)
		if err != nil {
			return nil, err
		}
		for _, item := range metas {
			if Visible(item, subject.UserID, subject.Admin) {
				items = append(items, item)
			}
		}
	}
	slices.SortFunc(items, func(a, b Item) int { return b.DeletedAt.Compare(a.DeletedAt) })
	return items, nil
}

func (s *Service) volumeItems(volume string) ([]Meta, error) {
	raw, err := s.cfg.Files.TrashList(volume)
	if err != nil {
		return nil, err //nolint:wrapcheck // internal error
	}
	items := make([]Meta, 0, len(raw))
	for id, data := range raw {
		var item Meta
		if json.Unmarshal(data, &item) != nil || item.ID != id {
			continue
		}
		items = append(items, item)
	}
	return items, nil
}

// find loads one item the person may act on.
func (s *Service) find(subject authz.Subject, id string) (Meta, string, error) {
	volume, ok := fsx.VolumeOfID(id)
	if !ok || volume == "" {
		return Meta{}, "", ErrNotFound
	}
	items, err := s.volumeItems(volume)
	if err != nil {
		return Meta{}, "", err
	}
	for _, item := range items {
		if item.ID == id && Visible(item, subject.UserID, subject.Admin) {
			return item, volume, nil
		}
	}
	return Meta{}, "", ErrNotFound
}

// Restored is where an item went back (renamed when its name was taken meanwhile).
type Restored struct {
	ID   string
	Path string
}

// Restore puts items back where they were, needing `create` there; a taken name keeps both.
func (s *Service) Restore(ctx context.Context, subject authz.Subject, ids []string, requestID string) ([]Restored, error) {
	access, err := transfer.LoadAccess(ctx, s.cfg.Grants, subject)
	if err != nil {
		return nil, err //nolint:wrapcheck // internal error
	}
	restored := make([]Restored, 0, len(ids))
	for _, id := range ids {
		item, volume, err := s.find(subject, id)
		if err != nil {
			return restored, err
		}
		if !access.Can("create", item.OriginalPath) {
			return restored, ErrForbidden
		}
		target := item.OriginalPath
		if taken, err := s.cfg.Files.Exists(target); err == nil && taken {
			parent := path.Dir(target)
			target = path.Join(parent, transfer.KeepBothName(item.Name, item.IsDir, func(candidate string) bool {
				exists, err := s.cfg.Files.Exists(path.Join(parent, candidate))
				return err == nil && exists
			}))
		}
		if err := s.cfg.Files.TrashRestore(volume, id, item.Name, target); err != nil {
			return restored, err //nolint:wrapcheck // classified by the caller
		}
		s.record(ctx, subject.UserID, "trash.restore", target, requestID, map[string]any{"id": id, "from": item.OriginalPath})
		restored = append(restored, Restored{ID: id, Path: target})
	}
	return restored, nil
}

// Kick asks the keeper to run soon (after deletes); extra kicks are merged.
func (s *Service) Kick() {
	select {
	case s.kick <- struct{}{}:
	default:
	}
}

// Keep runs the keeper until ctx ends: on every kick and every interval it measures new items
// and removes what retention and the limits no longer allow.
func (s *Service) Keep(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		s.Sweep(ctx)
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		case <-s.kick:
		}
	}
}

// Sweep is one keeper pass over every volume; it returns how many items were removed.
func (s *Service) Sweep(ctx context.Context) int {
	limits, err := s.cfg.Limits(ctx)
	if err != nil {
		s.cfg.Logger.Warn("trash limits unavailable, keeping defaults", slog.Any("error", err))
		limits = DefaultLimits
	}
	volumes, err := s.cfg.Files.Volumes()
	if err != nil {
		s.cfg.Logger.Warn("trash sweep skipped", slog.Any("error", err))
		return 0
	}
	removed := 0
	for _, volume := range volumes {
		removed += s.sweepVolume(ctx, volume, limits)
	}
	return removed
}

func (s *Service) sweepVolume(ctx context.Context, volume string, limits Limits) int {
	items, err := s.volumeItems(volume)
	if err != nil {
		return 0
	}
	for index, item := range items {
		if item.Measured {
			continue
		}
		bytes, files, err := s.cfg.Files.TrashMeasure(volume, item.ID)
		if err != nil {
			continue
		}
		item.Bytes, item.Files, item.Measured = bytes, files, true
		if encoded, err := json.Marshal(item); err == nil {
			_ = s.cfg.Files.TrashSetMeta(volume, item.ID, encoded)
		}
		items[index] = item
	}
	evictions := Evictions(items, limits, s.cfg.Now())
	reasons := map[string]int{}
	for _, eviction := range evictions {
		if err := s.cfg.Files.TrashRemove(volume, eviction.ID); err != nil && !errors.Is(err, fs.ErrNotExist) {
			continue
		}
		reasons[eviction.Reason]++
	}
	for reason, count := range reasons {
		s.record(ctx, "", "trash.purge", "/"+volume, "", map[string]any{"reason": reason, "items": count})
	}
	return len(evictions)
}

// Kinds of the trash jobs.
const (
	KindDelete = "delete"
	KindEmpty  = "trash_empty"
)

// DeleteArgs describe a permanent deletion of paths (bypassing the trash).
type DeleteArgs struct {
	Job     string        `json:"jobId"`
	Paths   []string      `json:"paths"`
	Subject authz.Subject `json:"subject"`
}

// Kind implements river.JobArgs.
func (DeleteArgs) Kind() string { return KindDelete }

// JobID implements jobs.Args.
func (a DeleteArgs) JobID() string { return a.Job }

// EmptyArgs describe removing trash items for good (all visible ones when IDs is empty).
type EmptyArgs struct {
	Job     string        `json:"jobId"`
	IDs     []string      `json:"ids"`
	Subject authz.Subject `json:"subject"`
}

// Kind implements river.JobArgs.
func (EmptyArgs) Kind() string { return KindEmpty }

// JobID implements jobs.Args.
func (a EmptyArgs) JobID() string { return a.Job }

// CheckPermanent validates a permanent delete before it is queued.
func (s *Service) CheckPermanent(ctx context.Context, subject authz.Subject, paths []string) ([]string, error) {
	return s.checkDeletable(ctx, subject, paths)
}

// DeleteHandler runs a permanent delete, checking each path again.
func (s *Service) DeleteHandler() jobs.Handler[DeleteArgs] {
	return func(ctx context.Context, args DeleteArgs, report *jobs.Reporter) (map[string]any, error) {
		cleaned, err := s.checkDeletable(ctx, args.Subject, args.Paths)
		if err != nil {
			return nil, &jobs.Failure{Code: "files.forbidden", Err: err}
		}
		total := int64(len(cleaned))
		progress := jobs.Progress{ItemsTotal: &total}
		for _, clean := range cleaned {
			if err := ctx.Err(); err != nil {
				return map[string]any{"items": progress.ItemsDone}, fmt.Errorf("stopped: %w", err)
			}
			progress.CurrentPath = clean
			_ = report.Progress(ctx, progress)
			if err := s.cfg.Files.RemoveAll(clean); err != nil {
				return map[string]any{"items": progress.ItemsDone}, err //nolint:wrapcheck // reported as a failed job
			}
			s.record(ctx, args.Subject.UserID, "fs.delete", clean, "", map[string]any{"permanent": true})
			progress.ItemsDone++
		}
		_ = report.Progress(ctx, progress)
		return map[string]any{"items": progress.ItemsDone}, nil
	}
}

// EmptyHandler removes trash items for good (the person's own, or any for administrators).
func (s *Service) EmptyHandler() jobs.Handler[EmptyArgs] {
	return func(ctx context.Context, args EmptyArgs, report *jobs.Reporter) (map[string]any, error) {
		ids := args.IDs
		if len(ids) == 0 {
			items, err := s.List(ctx, args.Subject)
			if err != nil {
				return nil, err
			}
			for _, item := range items {
				ids = append(ids, item.ID)
			}
		}
		total := int64(len(ids))
		progress := jobs.Progress{ItemsTotal: &total}
		for _, id := range ids {
			if err := ctx.Err(); err != nil {
				return map[string]any{"items": progress.ItemsDone}, fmt.Errorf("stopped: %w", err)
			}
			item, volume, err := s.find(args.Subject, id)
			if err != nil {
				continue
			}
			progress.CurrentPath = item.OriginalPath
			_ = report.Progress(ctx, progress)
			if err := s.cfg.Files.TrashRemove(volume, id); err != nil {
				return map[string]any{"items": progress.ItemsDone}, err //nolint:wrapcheck // reported as a failed job
			}
			progress.ItemsDone++
		}
		s.record(ctx, args.Subject.UserID, "trash.empty", "", "", map[string]any{"items": progress.ItemsDone})
		_ = report.Progress(ctx, progress)
		return map[string]any{"items": progress.ItemsDone}, nil
	}
}

// CurrentLimits returns the limits in force (shown on the trash page and in delete plans).
func (s *Service) CurrentLimits(ctx context.Context) (Limits, error) {
	return s.cfg.Limits(ctx)
}
