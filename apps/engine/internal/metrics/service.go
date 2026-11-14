package metrics

import (
	"context"
	"errors"
	"log/slog"
	"time"
)

// ErrForbidden is a metric the caller's permissions do not cover.
var ErrForbidden = errors.New("metrics: forbidden")

// ErrUnknown is a metric the engine does not sample.
var ErrUnknown = errors.New("metrics: unknown metric")

// Service samples on a schedule and answers queries.
type Service struct {
	Sampler   *Sampler
	Store     Store
	Retention func(ctx context.Context) (Retention, error)
	Logger    *slog.Logger
	Now       func() time.Time
}

// compactEvery: rolling up and purging once in a while is enough.
const compactEvery = 10 * time.Minute

// Run samples every SamplePeriod until ctx ends, compacting now and then.
func (s *Service) Run(ctx context.Context) {
	ticker := time.NewTicker(SamplePeriod)
	defer ticker.Stop()
	lastCompact := time.Time{}
	for {
		now := s.Now()
		if err := s.Store.Insert(ctx, now.Truncate(time.Second), s.Sampler.Sample(ctx, now)); err != nil {
			s.Logger.Warn("metrics: samples not stored", slog.Any("error", err))
		}
		if now.Sub(lastCompact) >= compactEvery {
			s.compact(ctx, now)
			lastCompact = now
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func (s *Service) compact(ctx context.Context, now time.Time) {
	retention, err := s.Retention(ctx)
	if err != nil {
		s.Logger.Warn("metrics: retention not read, defaults used", slog.Any("error", err))
		retention = DefaultRetention
	}
	if err := s.Store.Compact(ctx, now, retention); err != nil {
		s.Logger.Warn("metrics: not compacted", slog.Any("error", err))
	}
}

// Result answers a query: what the metric is, and its series.
type Result struct {
	Definition Definition
	Bucket     time.Duration
	Series     []SeriesPoints
}

// Query reads a metric the permissions allow over a range, in at most `points` buckets.
func (s *Service) Query(ctx context.Context, permissions []string, metric string, from, to time.Time, points int) (Result, error) {
	definition, ok := Lookup(metric)
	if !ok {
		return Result{}, ErrUnknown
	}
	if !MayRead(permissions, definition.Family) {
		return Result{}, ErrForbidden
	}
	retention, err := s.Retention(ctx)
	if err != nil {
		retention = DefaultRetention
	}
	plan := PlanQuery(from, to, s.Now(), points, retention)
	series, err := s.Store.Query(ctx, metric, from, to, plan)
	if err != nil {
		return Result{}, err
	}
	return Result{Definition: definition, Bucket: plan.Bucket, Series: series}, nil
}
