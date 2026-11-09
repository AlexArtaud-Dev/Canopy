package trash

import (
	"encoding/json"
	"testing"
	"time"
)

func TestLimitsFrom(t *testing.T) {
	if LimitsFrom(nil) != DefaultLimits {
		t.Fatal("defaults")
	}
	raw := func(value string) json.RawMessage { return json.RawMessage(value) }
	got := LimitsFrom(map[string]json.RawMessage{"retentionDays": raw("7"), "maxSizeMb": raw("100"), "maxFiles": raw("50")})
	if got.Retention != 7*24*time.Hour || got.MaxBytes != 100*megabyte || got.MaxFiles != 50 {
		t.Fatalf("stored: %+v", got)
	}
	if LimitsFrom(map[string]json.RawMessage{"maxFiles": raw("0"), "maxSizeMb": raw(`"x"`)}) != DefaultLimits {
		t.Fatal("invalid values fall back")
	}
}

func TestEvictions(t *testing.T) {
	now := time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC)
	ago := func(hours int) time.Time { return now.Add(-time.Duration(hours) * time.Hour) }
	items := []Meta{
		{ID: "new", DeletedAt: ago(1), Bytes: 40, Files: 4},
		{ID: "expired", DeletedAt: ago(800), Bytes: 1, Files: 1},
		{ID: "old", DeletedAt: ago(10), Bytes: 50, Files: 5},
		{ID: "mid", DeletedAt: ago(5), Bytes: 30, Files: 3},
	}
	limits := Limits{Retention: 30 * 24 * time.Hour, MaxBytes: 80, MaxFiles: 100}
	got := Evictions(items, limits, now)
	want := []Eviction{{ID: "expired", Reason: ReasonRetention}, {ID: "old", Reason: ReasonLimit}}
	if len(got) != len(want) || got[0] != want[0] || got[1] != want[1] {
		t.Fatalf("evictions %+v, want %+v", got, want)
	}
	// The file count is a limit too: oldest first until both fit.
	got = Evictions(items, Limits{Retention: limits.Retention, MaxBytes: 1000, MaxFiles: 4}, now)
	if len(got) != 3 || got[1].ID != "old" || got[2].ID != "mid" {
		t.Fatalf("by files: %+v", got)
	}
	if Evictions(nil, limits, now) != nil {
		t.Fatal("empty trash")
	}
}

func TestFitsAndVisible(t *testing.T) {
	limits := Limits{MaxBytes: 10, MaxFiles: 2}
	if !Fits(10, 2, limits) || Fits(11, 1, limits) || Fits(1, 3, limits) {
		t.Fatal("fits")
	}
	item := Meta{DeletedBy: "bob"}
	if !Visible(item, "bob", false) || Visible(item, "eve", false) || !Visible(item, "eve", true) {
		t.Fatal("visible")
	}
}
