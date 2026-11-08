package jobs

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// Bounds mirror the web app's jobs settings schema; out-of-range values fall back to defaults.
const (
	maxConcurrentCeiling = 32
	perUserCeiling       = 50
)

// LimitsFrom reads the stored `jobs` settings (only values differing from defaults are stored).
func LimitsFrom(values map[string]json.RawMessage) Limits {
	limits := DefaultLimits
	limits.MaxConcurrent = boundedInt(values["maxConcurrent"], 1, maxConcurrentCeiling, limits.MaxConcurrent)
	limits.PerUser = boundedInt(values["perUser"], 1, perUserCeiling, limits.PerUser)
	return limits
}

func boundedInt(raw json.RawMessage, low, high, fallback int) int {
	var value int
	if raw == nil || json.Unmarshal(raw, &value) != nil || value < low || value > high {
		return fallback
	}
	return value
}

// LoadLimits reads the jobs settings written by the web app (app.settings, read-only here).
func LoadLimits(ctx context.Context, db DB) (Limits, error) {
	rows, err := db.Query(ctx, `SELECT key, value FROM app.settings WHERE module = 'jobs'`)
	if err != nil {
		return Limits{}, fmt.Errorf("read jobs settings: %w", err)
	}
	values := map[string]json.RawMessage{}
	var key string
	var value []byte
	_, err = pgx.ForEachRow(rows, []any{&key, &value}, func() error {
		values[key] = append(json.RawMessage(nil), value...)
		return nil
	})
	if err != nil {
		return Limits{}, fmt.Errorf("read jobs settings: %w", err)
	}
	return LimitsFrom(values), nil
}
