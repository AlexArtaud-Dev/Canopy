package metrics

import (
	"context"
	"encoding/json"
	"time"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/appsettings"
)

// Retention is how long samples are kept: raw ones, then their hourly rollups.
type Retention struct {
	Raw    time.Duration
	Hourly time.Duration
}

// DefaultRetention mirrors the web app's system settings defaults.
var DefaultRetention = Retention{Raw: 24 * time.Hour, Hourly: 30 * 24 * time.Hour}

// Bounds mirror the web app's settings schema; out-of-range values fall back to defaults.
const (
	maxRawHours    = 24 * 7
	maxHourlyDays  = 365 * 2
	settingsModule = "system"
)

// RetentionFrom reads the stored `system` settings (only values differing from defaults are stored).
func RetentionFrom(values map[string]json.RawMessage) Retention {
	retention := DefaultRetention
	if hours, ok := boundedInt(values["metricsRawHours"], 1, maxRawHours); ok {
		retention.Raw = time.Duration(hours) * time.Hour
	}
	if days, ok := boundedInt(values["metricsHourlyDays"], 1, maxHourlyDays); ok {
		retention.Hourly = time.Duration(days) * 24 * time.Hour
	}
	return retention
}

func boundedInt(raw json.RawMessage, low, high int) (int, bool) {
	var value int
	if raw == nil || json.Unmarshal(raw, &value) != nil || value < low || value > high {
		return 0, false
	}
	return value, true
}

// LoadRetention reads the durations administrators set (defaults on a fresh install).
func LoadRetention(ctx context.Context, db appsettings.Querier) (Retention, error) {
	values, err := appsettings.Load(ctx, db, settingsModule)
	if err != nil {
		return Retention{}, err
	}
	return RetentionFrom(values), nil
}

// Plan is how a query reads a time range: from raw samples or hourly rollups, in buckets.
type Plan struct {
	Hourly bool
	Bucket time.Duration
}

// Minimum bucket widths: one sample period for raw values, one hour for rollups.
const (
	SamplePeriod  = 30 * time.Second
	maxQueryPoint = 1000
)

// PlanQuery picks the table and the bucket width for a range: raw samples while the whole range
// is still within their retention, hourly rollups beyond; at most `points` buckets.
func PlanQuery(from, to, now time.Time, points int, retention Retention) Plan {
	points = max(1, min(points, maxQueryPoint))
	hourly := from.Before(now.Add(-retention.Raw))
	floor := SamplePeriod
	if hourly {
		floor = time.Hour
	}
	span := to.Sub(from)
	bucket := max(floor, span/time.Duration(points))
	// Whole multiples of the floor keep buckets aligned with what was stored.
	bucket = (bucket + floor - 1) / floor * floor
	return Plan{Hourly: hourly, Bucket: bucket}
}
