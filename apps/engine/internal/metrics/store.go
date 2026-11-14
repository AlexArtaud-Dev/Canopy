package metrics

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// DB is the slice of pgx the store needs (a pool).
type DB interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// Store keeps samples in Postgres (engine.metric_samples, engine.metric_hourly).
type Store struct {
	DB DB
}

// Insert records one sampling; a sample already there for the same instant is kept.
func (s Store) Insert(ctx context.Context, at time.Time, samples []Sample) error {
	if len(samples) == 0 {
		return nil
	}
	metrics := make([]string, len(samples))
	series := make([]string, len(samples))
	values := make([]float64, len(samples))
	for index, sample := range samples {
		metrics[index], series[index], values[index] = sample.Metric, sample.Series, sample.Value
	}
	_, err := s.DB.Exec(ctx, `
		INSERT INTO engine.metric_samples (metric, series, at, value)
		SELECT metric, series, $4, value FROM unnest($1::text[], $2::text[], $3::float8[])
			AS sample(metric, series, value)
		ON CONFLICT DO NOTHING`, metrics, series, values, at)
	if err != nil {
		return fmt.Errorf("insert metric samples: %w", err)
	}
	return nil
}

// Compact rolls finished hours up from raw samples (idempotent), then forgets what is past the
// retention.
func (s Store) Compact(ctx context.Context, now time.Time, retention Retention) error {
	currentHour := now.Truncate(time.Hour)
	if _, err := s.DB.Exec(ctx, `
		INSERT INTO engine.metric_hourly (metric, series, hour, avg, min, max, samples)
		SELECT metric, series, date_trunc('hour', at), avg(value), min(value), max(value), count(*)
		FROM engine.metric_samples
		WHERE at < $1
		GROUP BY metric, series, date_trunc('hour', at)
		ON CONFLICT (metric, series, hour) DO UPDATE
			SET avg = excluded.avg, min = excluded.min, max = excluded.max, samples = excluded.samples`,
		currentHour); err != nil {
		return fmt.Errorf("roll metrics up: %w", err)
	}
	if _, err := s.DB.Exec(ctx, `DELETE FROM engine.metric_samples WHERE at < $1`,
		now.Add(-retention.Raw)); err != nil {
		return fmt.Errorf("purge metric samples: %w", err)
	}
	if _, err := s.DB.Exec(ctx, `DELETE FROM engine.metric_hourly WHERE hour < $1`,
		now.Add(-retention.Hourly)); err != nil {
		return fmt.Errorf("purge hourly metrics: %w", err)
	}
	return nil
}

// Point is a bucket's average, with its extremes.
type Point struct {
	At  time.Time
	Avg float64
	Min float64
	Max float64
}

// SeriesPoints is one series of a metric over a range.
type SeriesPoints struct {
	Name   string
	Points []Point
}

// Query reads a metric over [from, to) in buckets, one list per series, in time order.
func (s Store) Query(ctx context.Context, metric string, from, to time.Time, plan Plan) ([]SeriesPoints, error) {
	table, column, avg, low, high := "engine.metric_samples", "at", "value", "value", "value"
	if plan.Hourly {
		table, column, avg, low, high = "engine.metric_hourly", "hour", "avg", "min", "max"
	}
	// The identifiers come from the two fixed choices above, never from the request.
	rows, err := s.DB.Query(ctx, fmt.Sprintf(`
		SELECT series, date_bin($4::interval, %[2]s, $2) AS bucket,
			avg(%[3]s), min(%[4]s), max(%[5]s)
		FROM %[1]s
		WHERE metric = $1 AND %[2]s >= $2 AND %[2]s < $3
		GROUP BY series, bucket
		ORDER BY series, bucket`, table, column, avg, low, high),
		metric, from, to, plan.Bucket)
	if err != nil {
		return nil, fmt.Errorf("query metric %s: %w", metric, err)
	}
	var result []SeriesPoints
	var name string
	var point Point
	_, err = pgx.ForEachRow(rows, []any{&name, &point.At, &point.Avg, &point.Min, &point.Max}, func() error {
		if len(result) == 0 || result[len(result)-1].Name != name {
			result = append(result, SeriesPoints{Name: name})
		}
		last := &result[len(result)-1]
		last.Points = append(last.Points, Point{At: point.At.UTC(), Avg: point.Avg, Min: point.Min, Max: point.Max})
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("read metric %s: %w", metric, err)
	}
	return result, nil
}

// Counts reads the operations and the thumbnails cache from the engine's tables.
func (s Store) Counts(ctx context.Context, now time.Time) (Counts, error) {
	var counts Counts
	err := s.DB.QueryRow(ctx, `
		SELECT
			count(*) FILTER (WHERE state = 'running'),
			count(*) FILTER (WHERE state = 'queued'),
			count(*) FILTER (WHERE state = 'failed' AND finished_at >= $1),
			(SELECT coalesce(sum(bytes), 0)::bigint FROM engine.thumbnails)
		FROM engine.jobs
		WHERE state IN ('running', 'queued') OR (state = 'failed' AND finished_at >= $1)`,
		now.Add(-time.Hour)).Scan(&counts.Running, &counts.Queued, &counts.FailedLastHour, &counts.ThumbnailBytes)
	if err != nil {
		return Counts{}, fmt.Errorf("count operations: %w", err)
	}
	return counts, nil
}
