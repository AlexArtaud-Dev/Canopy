package disks

import (
	"encoding/json"
	"slices"
	"testing"
	"time"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/appsettings"
)

func TestSettingsFrom(t *testing.T) {
	if got := SettingsFrom(nil); got != DefaultSettings {
		t.Errorf("defaults: %+v", got)
	}
	got := SettingsFrom(appsettings.Values{
		"checkMinutes": json.RawMessage("60"), "hddTemperatureLimit": json.RawMessage("50"),
		"ssdTemperatureLimit": json.RawMessage("500"),
	})
	if got.Every != time.Hour || got.HDDLimit != 50 || got.SSDLimit != DefaultSettings.SSDLimit {
		t.Errorf("got %+v", got)
	}
	if DefaultSettings.Limit(KindHDD) != 55 || DefaultSettings.Limit(KindNVMe) != 70 || DefaultSettings.Limit(KindSSD) != 70 {
		t.Error("limits by kind")
	}
}

func TestNames(t *testing.T) {
	if Key(Disk{ID: "sda", Serial: "X1"}) != "serial:X1" || Key(Disk{ID: "sda"}) != "device:sda" {
		t.Error("keys")
	}
	for disk, want := range map[*Disk]string{
		{ID: "sda"}:                                             "sda",
		{ID: "sda", Model: "WD Red"}:                            "WD Red",
		{ID: "sda", Model: "WD Red", Serial: "AB"}:              "WD Red · AB",
		{ID: "sda", Model: "WD Red", Serial: "WD-WCC7K0000001"}: "WD Red · 0001",
	} {
		if got := SeriesName(*disk); got != want {
			t.Errorf("got %q, want %q", got, want)
		}
	}
}

func TestMergeKeepsSleepingDisks(t *testing.T) {
	previous := []Disk{{ID: "sda", Model: "WD", Temperature: value(30), Health: HealthPassed}, {ID: "sdz", Model: "Gone"}}
	current := []Disk{{ID: "sda", Asleep: true, Health: HealthUnknown}, {ID: "sdb", Model: "New"}, {ID: "sdc", Asleep: true}}
	merged := Merge(previous, current)
	if len(merged) != 3 || merged[0].Model != "WD" || !merged[0].Asleep || *merged[0].Temperature != 30 ||
		merged[0].Health != HealthPassed || merged[1].Model != "New" || !merged[2].Asleep {
		t.Errorf("got %+v", merged)
	}
}

func kinds(alerts []Alert) []AlertKind {
	out := make([]AlertKind, 0, len(alerts))
	for _, alert := range alerts {
		out = append(out, alert.Kind)
	}
	return out
}

func TestEvaluateHealth(t *testing.T) {
	healthy := Disk{ID: "sda", Serial: "S1", Model: "WD", Kind: KindHDD, Health: HealthPassed, Reasons: []string{}, Reallocated: value(0)}
	damaged := healthy
	damaged.Health, damaged.Reasons, damaged.Reallocated = HealthWarning, []string{ReasonReallocated}, value(8)
	worse := damaged
	worse.Reallocated = value(16)
	failing := damaged
	failing.Health, failing.Reasons = HealthFailing, []string{ReasonSmartFailed}

	// Seen for the first time: it says what it already shows.
	if _, alerts := Evaluate(nil, []Disk{damaged}, DefaultSettings); !slices.Equal(kinds(alerts), []AlertKind{AlertWarning}) ||
		!slices.Equal(alerts[0].Reasons, []string{ReasonReallocated}) || alerts[0].Name != "WD · S1" {
		t.Errorf("first sighting: %+v", alerts)
	}
	if _, alerts := Evaluate(nil, []Disk{healthy}, DefaultSettings); len(alerts) != 0 {
		t.Errorf("healthy: %+v", alerts)
	}
	// Same damage: quiet. More damage: an alert. A new device letter does not fool it (serial).
	moved := damaged
	moved.ID = "sdb"
	if _, alerts := Evaluate([]Disk{damaged}, []Disk{moved}, DefaultSettings); len(alerts) != 0 {
		t.Errorf("unchanged: %+v", alerts)
	}
	if _, alerts := Evaluate([]Disk{damaged}, []Disk{worse}, DefaultSettings); !slices.Equal(kinds(alerts), []AlertKind{AlertWarning}) {
		t.Errorf("grew: %+v", alerts)
	}
	if _, alerts := Evaluate([]Disk{healthy}, []Disk{damaged}, DefaultSettings); len(alerts) != 1 {
		t.Errorf("new reason: %+v", alerts)
	}
	if _, alerts := Evaluate([]Disk{damaged}, []Disk{failing}, DefaultSettings); !slices.Equal(kinds(alerts), []AlertKind{AlertFailing}) ||
		!slices.Equal(alerts[0].Reasons, []string{ReasonSmartFailed}) {
		t.Errorf("failing: %+v", alerts)
	}
	if _, alerts := Evaluate([]Disk{failing}, []Disk{failing}, DefaultSettings); len(alerts) != 0 {
		t.Errorf("still failing: %+v", alerts)
	}
	// A reason that has no counter (a failed test) does not "grow".
	tested := healthy
	tested.Health, tested.Reasons = HealthWarning, []string{ReasonTestFailed}
	if _, alerts := Evaluate([]Disk{tested}, []Disk{tested}, DefaultSettings); len(alerts) != 0 {
		t.Errorf("failed test repeated: %+v", alerts)
	}
	// A sleeping disk is not judged.
	asleep := failing
	asleep.Asleep = true
	if evaluated, alerts := Evaluate(nil, []Disk{asleep}, DefaultSettings); len(alerts) != 0 || len(evaluated) != 1 {
		t.Errorf("asleep: %+v", alerts)
	}
}

func TestEvaluateTemperature(t *testing.T) {
	at := func(degrees int64, was *Disk) (Disk, []Alert) {
		disk := Disk{ID: "nvme0", Serial: "N1", Kind: KindNVMe, Health: HealthPassed, Reasons: []string{}, Temperature: value(degrees)}
		var previous []Disk
		if was != nil {
			previous = []Disk{*was}
		}
		evaluated, alerts := Evaluate(previous, []Disk{disk}, DefaultSettings)
		return evaluated[0], alerts
	}
	cool, alerts := at(60, nil)
	if cool.Hot || len(alerts) != 0 {
		t.Fatalf("cool: %+v %+v", cool, alerts)
	}
	hot, alerts := at(71, &cool)
	if !hot.Hot || !slices.Equal(kinds(alerts), []AlertKind{AlertHot}) || *alerts[0].Limit != 70 || *alerts[0].Temperature != 71 {
		t.Fatalf("hot: %+v %+v", hot, alerts)
	}
	// Hovering around the limit: no new alert until it cooled down 3 degrees.
	hovering, alerts := at(69, &hot)
	if !hovering.Hot || len(alerts) != 0 {
		t.Errorf("hovering: %+v %+v", hovering, alerts)
	}
	cooled, alerts := at(67, &hovering)
	if cooled.Hot || len(alerts) != 0 {
		t.Errorf("cooled: %+v %+v", cooled, alerts)
	}
	if again, alerts := at(70, &cooled); !again.Hot || len(alerts) != 1 {
		t.Errorf("hot again: %+v %+v", again, alerts)
	}
	// No temperature this time: the disk keeps what it was.
	blind := Disk{ID: "nvme0", Serial: "N1", Kind: KindNVMe}
	if evaluated, _ := Evaluate([]Disk{hot}, []Disk{blind}, DefaultSettings); !evaluated[0].Hot {
		t.Error("lost the hot state without a reading")
	}
}

func TestCounter(t *testing.T) {
	disk := Disk{Reallocated: value(1), Pending: value(2), Uncorrectable: value(3), MediaErrors: value(4)}
	for reason, want := range map[string]int64{ReasonReallocated: 1, ReasonPending: 2, ReasonUncorrectable: 3, ReasonMediaErrors: 4} {
		equal(t, reason, counter(reason, disk), want)
	}
	if counter(ReasonWornOut, disk) != nil {
		t.Error("wear is not a counter")
	}
}
