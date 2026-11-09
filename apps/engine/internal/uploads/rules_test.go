package uploads

import (
	"encoding/json"
	"errors"
	"testing"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/transfer"
)

func TestParseRequest(t *testing.T) {
	request, err := ParseRequest(map[string]string{"destination": "/docs/", "filename": "a.txt"})
	if err != nil || request.Target != "/docs/a.txt" || request.Strategy != transfer.StrategySkip || request.ParentDir() != "/docs" {
		t.Fatalf("simple: %+v %v", request, err)
	}
	folder, err := ParseRequest(map[string]string{
		"destination": "/docs", "filename": "b.txt", "relativeDir": "/trip/day 1/", "strategy": "keep_both",
	})
	if err != nil || folder.Target != "/docs/trip/day 1/b.txt" || folder.RelativeDir != "trip/day 1" || folder.ParentDir() != "/docs/trip/day 1" {
		t.Fatalf("folder upload: %+v %v", folder, err)
	}
	bad := []map[string]string{
		{"destination": "docs", "filename": "a"},
		{"destination": "/docs", "filename": ""},
		{"destination": "/docs", "filename": "a/b"},
		{"destination": "/docs", "filename": "a", "strategy": "merge"},
		{"destination": "/docs", "filename": "a", "relativeDir": "x/../y"},
		{"destination": "/docs", "filename": "a", "relativeDir": "ok/.canopy-uploads"},
		{"destination": "/.canopy-uploads", "filename": "a"},
	}
	for _, meta := range bad {
		if _, err := ParseRequest(meta); !errors.Is(err, ErrBadMetadata) {
			t.Errorf("ParseRequest(%v) = %v", meta, err)
		}
	}
}

func TestLimits(t *testing.T) {
	limits := Limits{MaxBytes: 10, Blocked: []string{"exe"}}
	if limits.Check("a.txt", 10) != nil || limits.Check("README", 1) != nil {
		t.Fatal("within limits")
	}
	if !errors.Is(limits.Check("a.txt", 11), ErrTooLarge) || !errors.Is(limits.Check("setup.EXE", 1), ErrBlockedType) {
		t.Fatal("refusals")
	}
	if (Limits{}).Check("huge.iso", 1<<40) != nil {
		t.Fatal("no limit by default")
	}

	raw := func(value string) json.RawMessage { return json.RawMessage(value) }
	got := LimitsFrom(map[string]json.RawMessage{
		"maxFileSizeMb": raw("2"), "blockedExtensions": raw(`" .EXE, bat;;"`),
	})
	if got.MaxBytes != 2*megabyte || len(got.Blocked) != 2 || got.Blocked[0] != "exe" {
		t.Fatalf("stored: %+v", got)
	}
	if got := LimitsFrom(map[string]json.RawMessage{"maxFileSizeMb": raw("0"), "blockedExtensions": raw("[1]")}); got.MaxBytes != 0 || got.Blocked != nil {
		t.Fatalf("invalid values: %+v", got)
	}
}
