// Package trash keeps deleted items per volume so they can be restored, within limits: a
// retention period, and a maximum size and number of files per volume. A background keeper
// measures new items and removes the oldest ones beyond those limits, so deleting cannot be used
// to fill a disk.
package trash

import (
	"context"
	"encoding/json"
	"slices"
	"time"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/appsettings"
)

// Error codes (translated by the web app).
const (
	CodeVolume   = "files.volume_protected"
	CodeNotFound = "trash.not_found"
)

// Meta is what the trash remembers about an item (stored next to it as JSON).
type Meta struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	OriginalPath string    `json:"originalPath"`
	IsDir        bool      `json:"isDir"`
	DeletedAt    time.Time `json:"deletedAt"`
	DeletedBy    string    `json:"deletedBy"`
	// Bytes and Files are measured by the keeper after the item is moved (Measured).
	Bytes    int64 `json:"bytes"`
	Files    int64 `json:"files"`
	Measured bool  `json:"measured"`
}

// Limits are the administrator's trash settings, per volume.
type Limits struct {
	Retention time.Duration
	MaxBytes  int64
	MaxFiles  int64
}

const megabyte = 1 << 20

// DefaultLimits apply when nothing is stored: 30 days, 10 GiB, 10,000 files per volume.
var DefaultLimits = Limits{Retention: 30 * 24 * time.Hour, MaxBytes: 10 * 1024 * megabyte, MaxFiles: 10_000}

// LimitsFrom reads the stored `trash` settings (only values differing from defaults exist).
func LimitsFrom(values map[string]json.RawMessage) Limits {
	limits := DefaultLimits
	if days := positive(values["retentionDays"]); days > 0 {
		limits.Retention = time.Duration(days) * 24 * time.Hour
	}
	if mb := positive(values["maxSizeMb"]); mb > 0 {
		limits.MaxBytes = mb * megabyte
	}
	if files := positive(values["maxFiles"]); files > 0 {
		limits.MaxFiles = files
	}
	return limits
}

func positive(raw json.RawMessage) int64 {
	var value int64
	if raw == nil || json.Unmarshal(raw, &value) != nil || value <= 0 {
		return 0
	}
	return value
}

// LoadLimits reads the trash settings written by the web app.
func LoadLimits(ctx context.Context, db appsettings.Querier) (Limits, error) {
	values, err := appsettings.Load(ctx, db, "trash")
	if err != nil {
		return Limits{}, err
	}
	return LimitsFrom(values), nil
}

// Reasons an item leaves the trash on its own.
const (
	ReasonRetention = "retention"
	ReasonLimit     = "limit"
)

// Eviction is one item the keeper removes, and why.
type Eviction struct {
	ID     string
	Reason string
}

// Evictions picks what leaves a volume's trash: items past retention, then the oldest ones until
// both the size and the file count are within limits. Items not measured yet count as they are
// (zero) and are reconsidered once measured.
func Evictions(items []Meta, limits Limits, now time.Time) []Eviction {
	sorted := slices.Clone(items)
	slices.SortFunc(sorted, func(a, b Meta) int { return a.DeletedAt.Compare(b.DeletedAt) })
	var evicted []Eviction
	var bytes, files int64
	kept := sorted[:0]
	for _, item := range sorted {
		if now.Sub(item.DeletedAt) > limits.Retention {
			evicted = append(evicted, Eviction{ID: item.ID, Reason: ReasonRetention})
			continue
		}
		kept = append(kept, item)
		bytes += item.Bytes
		files += item.Files
	}
	for _, item := range kept {
		if bytes <= limits.MaxBytes && files <= limits.MaxFiles {
			break
		}
		evicted = append(evicted, Eviction{ID: item.ID, Reason: ReasonLimit})
		bytes -= item.Bytes
		files -= item.Files
	}
	return evicted
}

// Fits reports whether a single item could stay in the trash at all.
func Fits(bytes, files int64, limits Limits) bool {
	return bytes <= limits.MaxBytes && files <= limits.MaxFiles
}

// Visible reports whether a person sees an item: their own deletions, or all for administrators.
func Visible(item Meta, user string, admin bool) bool {
	return admin || item.DeletedBy == user
}
