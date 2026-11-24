package jobs

import (
	"context"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/appsettings"
)

// Bounds mirror the web app's jobs settings schema; out-of-range values fall back to defaults.
const (
	maxConcurrentCeiling = 32
	perUserCeiling       = 50
)

// LimitsFrom reads the stored `jobs` settings (only values differing from defaults are stored).
func LimitsFrom(values appsettings.Values) Limits {
	limits := DefaultLimits
	limits.MaxConcurrent = values.Int("maxConcurrent", 1, maxConcurrentCeiling, limits.MaxConcurrent)
	limits.PerUser = values.Int("perUser", 1, perUserCeiling, limits.PerUser)
	return limits
}

// LoadLimits reads the jobs settings written by the web app (app.settings, read-only here). On a
// fresh install the engine starts before the web app has created that table: defaults apply.
func LoadLimits(ctx context.Context, db appsettings.Querier) (Limits, error) {
	values, err := appsettings.Load(ctx, db, "jobs")
	if err != nil {
		return Limits{}, err
	}
	return LimitsFrom(values), nil
}
