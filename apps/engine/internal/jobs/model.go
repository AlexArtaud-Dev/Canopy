// Package jobs runs every operation that can exceed a second: a job model with live progress,
// cancellation, capped logs and concurrency limits, executed by River. This file is pure.
package jobs

import (
	"errors"
	"math"
	"time"
)

// States of a job; terminal states never change again.
const (
	StateQueued    = "queued"
	StateRunning   = "running"
	StateSucceeded = "succeeded"
	StateFailed    = "failed"
	StateCancelled = "cancelled"
)

// Error codes returned to the web app (translated there).
const (
	CodeNotFound   = "jobs.not_found"
	CodeTooMany    = "jobs.too_many"
	CodeNotRunning = "jobs.not_cancellable"
	CodeFailed     = "jobs.failed"
	// CodeInterrupted marks jobs that were running when the engine stopped.
	CodeInterrupted = "jobs.interrupted"
)

// ErrTooMany is returned when the user already has as many active jobs as allowed.
var ErrTooMany = errors.New("too many active jobs")

// IsTerminal reports whether a state is final.
func IsTerminal(state string) bool {
	return state == StateSucceeded || state == StateFailed || state == StateCancelled
}

// Progress is what a running job reports; totals are nil while unknown (still scanning).
type Progress struct {
	BytesDone   int64
	BytesTotal  *int64
	ItemsDone   int64
	ItemsTotal  *int64
	CurrentPath string
}

// Snapshot adds the derived rate and remaining time.
type Snapshot struct {
	Progress
	RateBps    *int64
	EtaSeconds *int32
}

// Estimate derives throughput and ETA from bytes done since the job started. No estimate until
// a second has passed (early rates are noise) or while the total is unknown.
func Estimate(progress Progress, started, now time.Time) Snapshot {
	snapshot := Snapshot{Progress: progress}
	elapsed := now.Sub(started).Seconds()
	if elapsed < 1 || progress.BytesDone <= 0 {
		return snapshot
	}
	rate := int64(float64(progress.BytesDone) / elapsed)
	snapshot.RateBps = &rate
	if progress.BytesTotal != nil && rate > 0 {
		remaining := max(*progress.BytesTotal-progress.BytesDone, 0)
		eta := int32(min(remaining/rate, math.MaxInt32)) //nolint:gosec // clamped just above
		snapshot.EtaSeconds = &eta
	}
	return snapshot
}

// Throttle limits how often progress is persisted and broadcast (about once a second), so a job
// copying thousands of small files does not hammer the database.
type Throttle struct {
	interval time.Duration
	last     time.Time
}

// NewThrottle builds a throttle with the given minimum interval.
func NewThrottle(interval time.Duration) *Throttle {
	return &Throttle{interval: interval}
}

// Allow reports whether an update may go out now (always true the first time).
func (t *Throttle) Allow(now time.Time) bool {
	if !t.last.IsZero() && now.Sub(t.last) < t.interval {
		return false
	}
	t.last = now
	return true
}

// Limits are the admin settings bounding concurrency.
type Limits struct {
	// MaxConcurrent jobs running at once on this engine.
	MaxConcurrent int
	// PerUser active (queued or running) jobs one user may have.
	PerUser int
}

// DefaultLimits apply when no setting is stored.
var DefaultLimits = Limits{MaxConcurrent: 4, PerUser: 3}

// CheckPerUser refuses a new job when the user already has PerUser active ones.
func CheckPerUser(active int, limits Limits) error {
	if active >= limits.PerUser {
		return ErrTooMany
	}
	return nil
}

// MaxLogLines caps the output kept per job; older lines are dropped from the live view.
const MaxLogLines = 1000
