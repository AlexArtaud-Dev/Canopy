package jobs

import (
	"context"
	"time"
)

// progressInterval bounds how often progress reaches the database (and browsers).
const progressInterval = time.Second

// Sink is where a reporter writes (the Store in production).
type Sink interface {
	SaveProgress(ctx context.Context, id string, snapshot Snapshot, at time.Time) error
	AppendLog(ctx context.Context, id string, seq int, level, line string, at time.Time) error
}

// Reporter is handed to a running job to publish its progress and output.
type Reporter struct {
	sink     Sink
	id       string
	started  time.Time
	now      func() time.Time
	throttle *Throttle
	latest   Progress
	pending  bool
	seq      int
}

// NewReporter builds the reporter a job's handler receives.
func NewReporter(sink Sink, id string, started time.Time, now func() time.Time) *Reporter {
	return &Reporter{sink: sink, id: id, started: started, now: now, throttle: NewThrottle(progressInterval)}
}

// Progress records the job's latest progress; it is persisted at most about once a second.
func (r *Reporter) Progress(ctx context.Context, progress Progress) error {
	r.latest = progress
	r.pending = true
	now := r.now()
	if !r.throttle.Allow(now) {
		return nil
	}
	return r.save(ctx, now)
}

// Flush persists the latest progress if a throttled update is still pending.
func (r *Reporter) Flush(ctx context.Context) error {
	if !r.pending {
		return nil
	}
	return r.save(ctx, r.now())
}

func (r *Reporter) save(ctx context.Context, now time.Time) error {
	r.pending = false
	return r.sink.SaveProgress(ctx, r.id, Estimate(r.latest, r.started, now), now)
}

// Log keeps one output line (warnings, external command output).
func (r *Reporter) Log(ctx context.Context, level, line string) error {
	r.seq++
	return r.sink.AppendLog(ctx, r.id, r.seq, level, line, r.now())
}
