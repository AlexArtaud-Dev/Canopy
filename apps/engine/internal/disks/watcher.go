package disks

import (
	"context"
	"errors"
	"log/slog"
	"sync"
	"time"
)

// State is the latest reading of the disks.
type State struct {
	// CheckedAt is nil until the disks were read once.
	CheckedAt *time.Time `json:"checkedAt,omitempty"`
	Disks     []Disk     `json:"disks"`
}

// Store keeps the latest reading and the alerts not delivered yet.
type Store interface {
	Load(ctx context.Context) (State, error)
	// Save replaces the reading and queues the alerts, together.
	Save(ctx context.Context, state State, alerts []Alert) error
	// Claim hands out queued alerts once, oldest first.
	Claim(ctx context.Context, limit int) ([]Alert, error)
	// Purge forgets delivered alerts from before a time.
	Purge(ctx context.Context, before time.Time) error
}

// alertKeep is how long delivered alerts are kept (for diagnosis).
const alertKeep = 30 * 24 * time.Hour

// retryAfter is the wait after a failed reading (the service may still be starting).
const retryAfter = time.Minute

// Watcher reads the disks on a schedule, keeps the latest reading and queues alerts.
type Watcher struct {
	Reader   Reader
	Store    Store
	Settings func(ctx context.Context) (Settings, error)
	Logger   *slog.Logger
	Now      func() time.Time
	mu       sync.Mutex
}

// Current is the latest reading, without asking the disks.
func (w *Watcher) Current(ctx context.Context) (State, error) {
	return w.Store.Load(ctx)
}

// Check reads the disks now: sleeping disks keep their last values and are not woken up.
func (w *Watcher) Check(ctx context.Context) (State, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	settings, err := w.Settings(ctx)
	if err != nil {
		return State{}, err
	}
	previous, err := w.Store.Load(ctx)
	if err != nil {
		return State{}, err
	}
	current, err := w.Reader.List(ctx)
	if err != nil {
		return State{}, err
	}
	disks, alerts := Evaluate(previous.Disks, Merge(previous.Disks, current), settings)
	now := w.Now()
	state := State{CheckedAt: &now, Disks: disks}
	if err := w.Store.Save(ctx, state, alerts); err != nil {
		return State{}, err
	}
	return state, nil
}

// Claim hands out the alerts not delivered yet.
func (w *Watcher) Claim(ctx context.Context, limit int) ([]Alert, error) {
	return w.Store.Claim(ctx, limit)
}

// Run checks the disks at the pace administrators set, until ctx ends.
func (w *Watcher) Run(ctx context.Context) {
	for {
		wait := w.round(ctx)
		select {
		case <-ctx.Done():
			return
		case <-time.After(wait):
		}
	}
}

// round is one scheduled check; it returns how long to wait before the next one.
func (w *Watcher) round(ctx context.Context) time.Duration {
	if _, err := w.Check(ctx); err != nil {
		if !errors.Is(err, context.Canceled) {
			w.Logger.Warn("disks: check failed", slog.Any("error", err))
		}
		return retryAfter
	}
	if err := w.Store.Purge(ctx, w.Now().Add(-alertKeep)); err != nil {
		w.Logger.Warn("disks: alerts not purged", slog.Any("error", err))
	}
	settings, err := w.Settings(ctx)
	if err != nil {
		return DefaultSettings.Every
	}
	return settings.Every
}
