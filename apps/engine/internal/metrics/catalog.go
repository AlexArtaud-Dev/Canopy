package metrics

import (
	"slices"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/enginetoken"
)

// Family groups metrics under one permission (`metrics:<family>`), so roles grant whole families.
type Family string

const (
	FamilySystem     Family = "system"
	FamilyStorage    Family = "storage"
	FamilyOperations Family = "operations"
)

// Unit tells dashboards how to show a value.
type Unit string

const (
	UnitPercent        Unit = "percent"
	UnitBytes          Unit = "bytes"
	UnitBytesPerSecond Unit = "bytesPerSecond"
	UnitCount          Unit = "count"
)

// Definition describes one metric the engine samples.
type Definition struct {
	Name   string
	Family Family
	Unit   Unit
	// Series is true when the metric has one series per thing (a volume), named in samples.
	Series bool
}

// Metric names: stable identifiers stored with every sample.
const (
	CPUPercentName       = "system.cpu"
	MemoryUsedName       = "system.memory.used"
	MemoryTotalName      = "system.memory.total"
	NetworkReceivedName  = "system.network.received"
	NetworkSentName      = "system.network.sent"
	VolumeUsedName       = "storage.volume.used"
	VolumeTotalName      = "storage.volume.total"
	TrashBytesName       = "storage.trash"
	ThumbnailBytesName   = "storage.thumbnails"
	OperationsRunning    = "operations.running"
	OperationsQueued     = "operations.queued"
	OperationsFailedHour = "operations.failed"
)

// Catalog lists every metric, in the order dashboards offer them.
var Catalog = []Definition{
	{Name: CPUPercentName, Family: FamilySystem, Unit: UnitPercent},
	{Name: MemoryUsedName, Family: FamilySystem, Unit: UnitBytes},
	{Name: MemoryTotalName, Family: FamilySystem, Unit: UnitBytes},
	{Name: NetworkReceivedName, Family: FamilySystem, Unit: UnitBytesPerSecond},
	{Name: NetworkSentName, Family: FamilySystem, Unit: UnitBytesPerSecond},
	{Name: VolumeUsedName, Family: FamilyStorage, Unit: UnitBytes, Series: true},
	{Name: VolumeTotalName, Family: FamilyStorage, Unit: UnitBytes, Series: true},
	{Name: TrashBytesName, Family: FamilyStorage, Unit: UnitBytes},
	{Name: ThumbnailBytesName, Family: FamilyStorage, Unit: UnitBytes},
	{Name: OperationsRunning, Family: FamilyOperations, Unit: UnitCount},
	{Name: OperationsQueued, Family: FamilyOperations, Unit: UnitCount},
	{Name: OperationsFailedHour, Family: FamilyOperations, Unit: UnitCount},
}

// Lookup finds a metric by name.
func Lookup(name string) (Definition, bool) {
	index := slices.IndexFunc(Catalog, func(definition Definition) bool { return definition.Name == name })
	if index < 0 {
		return Definition{}, false
	}
	return Catalog[index], true
}

// Permission is the global permission reading a family needs.
func Permission(family Family) string {
	return "metrics:" + string(family)
}

// MayRead tells whether permissions allow a family (administrators read everything).
func MayRead(permissions []string, family Family) bool {
	return slices.Contains(permissions, enginetoken.AdminPermission) ||
		slices.Contains(permissions, Permission(family))
}

// Visible is the part of the catalog the permissions allow, in catalog order.
func Visible(permissions []string) []Definition {
	visible := make([]Definition, 0, len(Catalog))
	for _, definition := range Catalog {
		if MayRead(permissions, definition.Family) {
			visible = append(visible, definition)
		}
	}
	return visible
}
