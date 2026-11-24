package disks

import (
	"slices"
	"time"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/appsettings"
)

// SettingsModule is where the web app stores the disks settings.
const SettingsModule = "disks"

// Settings are what administrators tune; bounds mirror the web app's schema.
type Settings struct {
	// Every is how often disks are read (sleeping disks are not woken up).
	Every time.Duration
	// HDDLimit and SSDLimit are the temperatures (°C) from which a disk is too hot; SSDs and NVMe
	// drives run warmer than spinning disks.
	HDDLimit int64
	SSDLimit int64
}

// DefaultSettings apply until an administrator changes them.
var DefaultSettings = Settings{Every: 15 * time.Minute, HDDLimit: 55, SSDLimit: 70}

// SettingsFrom reads the stored `disks` settings.
func SettingsFrom(values appsettings.Values) Settings {
	return Settings{
		Every:    time.Duration(values.Int("checkMinutes", 5, 1440, int(DefaultSettings.Every/time.Minute))) * time.Minute,
		HDDLimit: int64(values.Int("hddTemperatureLimit", 30, 90, int(DefaultSettings.HDDLimit))),
		SSDLimit: int64(values.Int("ssdTemperatureLimit", 30, 100, int(DefaultSettings.SSDLimit))),
	}
}

// Limit is the temperature from which this disk is too hot.
func (s Settings) Limit(kind Kind) int64 {
	if kind == KindHDD {
		return s.HDDLimit
	}
	return s.SSDLimit
}

// coolDown is how far below its limit a hot disk must come back before it may alert again.
const coolDown = 3

// AlertKind is what happened to a disk.
type AlertKind string

// The alerts.
const (
	// AlertFailing: the disk now says it is failing.
	AlertFailing AlertKind = "failing"
	// AlertWarning: new signs of damage or wear (a reason appeared, or damaged sectors grew).
	AlertWarning AlertKind = "warning"
	// AlertHot: the disk went past its temperature limit.
	AlertHot AlertKind = "hot"
)

// Alert is one change worth telling administrators about.
type Alert struct {
	Disk        string    `json:"disk"`
	Name        string    `json:"name"`
	Kind        AlertKind `json:"kind"`
	Reasons     []string  `json:"reasons"`
	Temperature *int64    `json:"temperature,omitempty"`
	Limit       *int64    `json:"limit,omitempty"`
}

// Key follows a disk across reboots: its serial number, which device letters do not keep.
func Key(disk Disk) string {
	if disk.Serial != "" {
		return "serial:" + disk.Serial
	}
	return "device:" + disk.ID
}

// SeriesName names a disk in dashboards: readable, and stable while the disk is the same.
func SeriesName(disk Disk) string {
	if disk.Model == "" {
		return disk.ID
	}
	if serial := disk.Serial; serial != "" {
		const tail = 4
		return disk.Model + " · " + serial[max(len(serial)-tail, 0):]
	}
	return disk.Model
}

// Merge keeps what is known of sleeping disks: smartctl does not wake them, so they come back
// with nothing but their device. Disks that are gone are dropped.
func Merge(previous, current []Disk) []Disk {
	byID := make(map[string]Disk, len(previous))
	for _, disk := range previous {
		byID[disk.ID] = disk
	}
	merged := make([]Disk, 0, len(current))
	for _, disk := range current {
		if known, ok := byID[disk.ID]; ok && disk.Asleep {
			known.Asleep = true
			disk = known
		}
		merged = append(merged, disk)
	}
	return merged
}

// Evaluate compares two readings: it marks the disks that are too hot (a hot disk stays hot until
// it cools down a few degrees below its limit) and lists what changed. Only changes alert: a disk
// that stays damaged or hot says so once, not at every reading. A disk seen for the first time
// alerts on what it already shows.
func Evaluate(previous, current []Disk, settings Settings) ([]Disk, []Alert) {
	byKey := make(map[string]Disk, len(previous))
	for _, disk := range previous {
		byKey[Key(disk)] = disk
	}
	evaluated := make([]Disk, 0, len(current))
	var alerts []Alert
	for _, disk := range current {
		before, known := byKey[Key(disk)]
		if disk.Asleep {
			evaluated = append(evaluated, disk)
			continue
		}
		limit := settings.Limit(disk.Kind)
		disk.Hot = hot(disk.Temperature, limit, known && before.Hot)
		evaluated = append(evaluated, disk)
		alert := Alert{Disk: disk.ID, Name: SeriesName(disk), Reasons: []string{}}
		switch {
		case disk.Health == HealthFailing && (!known || before.Health != HealthFailing):
			alert.Kind, alert.Reasons = AlertFailing, disk.Reasons
			alerts = append(alerts, alert)
		case disk.Health == HealthWarning:
			if reasons := newReasons(before, disk, known); len(reasons) > 0 {
				alert.Kind, alert.Reasons = AlertWarning, reasons
				alerts = append(alerts, alert)
			}
		}
		if disk.Hot && (!known || !before.Hot) {
			alerts = append(alerts, Alert{
				Disk: disk.ID, Name: SeriesName(disk), Kind: AlertHot, Reasons: []string{},
				Temperature: disk.Temperature, Limit: &limit,
			})
		}
	}
	return evaluated, alerts
}

// hot tells whether a disk is too hot: past its limit, or still near it after having been.
func hot(temperature *int64, limit int64, wasHot bool) bool {
	switch {
	case temperature == nil:
		return wasHot
	case wasHot:
		return *temperature > limit-coolDown
	default:
		return *temperature >= limit
	}
}

// newReasons are the reasons the disk did not have before, plus damaged sectors or media errors
// that grew since.
func newReasons(before, now Disk, known bool) []string {
	if !known {
		return now.Reasons
	}
	var reasons []string
	for _, reason := range now.Reasons {
		if !slices.Contains(before.Reasons, reason) || grew(reason, before, now) {
			reasons = append(reasons, reason)
		}
	}
	return reasons
}

func grew(reason string, before, now Disk) bool {
	was, is := counter(reason, before), counter(reason, now)
	return was != nil && is != nil && *is > *was
}

// counter is the count behind a reason, for the reasons that count something.
func counter(reason string, disk Disk) *int64 {
	switch reason {
	case ReasonReallocated:
		return disk.Reallocated
	case ReasonPending:
		return disk.Pending
	case ReasonUncorrectable:
		return disk.Uncorrectable
	case ReasonMediaErrors:
		return disk.MediaErrors
	default:
		return nil
	}
}
