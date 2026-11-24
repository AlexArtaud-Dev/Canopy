// Package disks reads the health of the host's disks through smartctl. A small privileged
// service runs smartctl (it alone sees the devices); the engine asks it, keeps the latest
// reading, samples metrics from it and raises alerts.
package disks

import (
	"encoding/json"
	"fmt"
	"path"
	"regexp"
	"slices"
	"strings"
)

// Kind is what a disk is made of, which decides the temperature it may reach.
type Kind string

// The kinds of disks.
const (
	KindHDD     Kind = "hdd"
	KindSSD     Kind = "ssd"
	KindNVMe    Kind = "nvme"
	KindUnknown Kind = "unknown"
)

// Health is the verdict on a disk.
type Health string

// The verdicts, from worst to unknown.
const (
	// HealthFailing: the disk says it is failing (SMART status, NVMe critical warning).
	HealthFailing Health = "failing"
	// HealthWarning: it works, but shows signs of wear or damage worth acting on.
	HealthWarning Health = "warning"
	HealthPassed  Health = "passed"
	// HealthUnknown: the disk reports no SMART data (virtual disk, some USB bridges).
	HealthUnknown Health = "unknown"
)

// SelfTest is a disk's self-test: the one running, and the latest result.
type SelfTest struct {
	Running bool `json:"running"`
	// RemainingPercent is how much of the running test is left.
	RemainingPercent *int `json:"remainingPercent,omitempty"`
	// Last is the latest finished (or aborted) test.
	Last *SelfTestResult `json:"last,omitempty"`
}

// SelfTestResult is one entry of the disk's self-test log.
type SelfTestResult struct {
	// Kind is how the disk names the test ("Short offline", "Extended").
	Kind   string `json:"kind"`
	Result string `json:"result"`
	Passed bool   `json:"passed"`
	// PowerOnHours is the disk's age when the test ran.
	PowerOnHours *int64 `json:"powerOnHours,omitempty"`
}

// Disk is one disk as smartctl reports it. Counters are nil when the disk does not report them.
type Disk struct {
	ID       string `json:"id"`
	Device   string `json:"device"`
	Type     string `json:"type"`
	Kind     Kind   `json:"kind"`
	Model    string `json:"model"`
	Serial   string `json:"serial"`
	Firmware string `json:"firmware"`
	Capacity int64  `json:"capacity"`
	Health   Health `json:"health"`
	// Reasons say why the health is not "passed" (codes the web app translates).
	Reasons []string `json:"reasons"`
	// Asleep: the disk was spun down and left so; its last values are kept by the engine.
	Asleep bool `json:"asleep"`
	// Hot: past its temperature limit (set by the engine, which knows the limits).
	Hot           bool     `json:"hot"`
	Temperature   *int64   `json:"temperature,omitempty"`
	PowerOnHours  *int64   `json:"powerOnHours,omitempty"`
	PowerCycles   *int64   `json:"powerCycles,omitempty"`
	Reallocated   *int64   `json:"reallocated,omitempty"`
	Pending       *int64   `json:"pending,omitempty"`
	Uncorrectable *int64   `json:"uncorrectable,omitempty"`
	CRCErrors     *int64   `json:"crcErrors,omitempty"`
	MediaErrors   *int64   `json:"mediaErrors,omitempty"`
	WearPercent   *int64   `json:"wearPercent,omitempty"`
	Spare         *int64   `json:"spare,omitempty"`
	SpareLimit    *int64   `json:"spareLimit,omitempty"`
	BytesWritten  *int64   `json:"bytesWritten,omitempty"`
	SelfTest      SelfTest `json:"selfTest"`
}

// Device is a disk smartctl found: what it is opened with.
type Device struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Type string `json:"type"`
}

// Reasons for a health other than "passed".
const (
	ReasonSmartFailed     = "smartFailed"
	ReasonCriticalWarning = "criticalWarning"
	ReasonReallocated     = "reallocated"
	ReasonPending         = "pending"
	ReasonUncorrectable   = "uncorrectable"
	ReasonMediaErrors     = "mediaErrors"
	ReasonWornOut         = "wornOut"
	ReasonLowSpare        = "lowSpare"
	ReasonTestFailed      = "testFailed"
)

// wornOutPercent is the wear from which a disk should be replaced soon.
const wornOutPercent = 90

// nvmeDataUnit is the size NVMe counts written data in (1000 blocks of 512 bytes).
const nvmeDataUnit = 512_000

var (
	idPattern    = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,39}$`)
	devicePath   = regexp.MustCompile(`^/dev/[A-Za-z0-9/_-]{1,64}$`)
	deviceType   = regexp.MustCompile(`^[a-z0-9]{1,16}(,[0-9a-z+]{1,16})?$`)
	unsafeIDRune = regexp.MustCompile(`[^a-z0-9]+`)
	asleepNotice = regexp.MustCompile(`is in (STANDBY|SLEEP)`)
)

// ValidID tells whether an id may name a disk (it travels in URLs).
func ValidID(id string) bool {
	return idPattern.MatchString(id)
}

// scan is smartctl --scan-open -j.
type scan struct {
	Devices []struct {
		Name string `json:"name"`
		Type string `json:"type"`
	} `json:"devices"`
}

// ParseScan lists the devices of `smartctl --scan-open -j`, with stable ids ("sda",
// "nvme0", "sdb-megaraid-1" when one device holds several disks). Entries that do not look
// like a device are dropped: their names go into smartctl's arguments.
func ParseScan(data []byte) ([]Device, error) {
	var parsed scan
	if err := json.Unmarshal(data, &parsed); err != nil {
		return nil, fmt.Errorf("read smartctl scan: %w", err)
	}
	devices := make([]Device, 0, len(parsed.Devices))
	seen := map[string]bool{}
	for _, entry := range parsed.Devices {
		if !devicePath.MatchString(entry.Name) || strings.Contains(entry.Name, "..") ||
			!deviceType.MatchString(entry.Type) {
			continue
		}
		id := deviceID(entry.Name, entry.Type)
		if !ValidID(id) || seen[id] {
			continue
		}
		seen[id] = true
		devices = append(devices, Device{ID: id, Name: entry.Name, Type: entry.Type})
	}
	return devices, nil
}

func deviceID(name, kind string) string {
	id := strings.ToLower(path.Base(name))
	if _, sub, found := strings.Cut(kind, ","); found {
		prefix, _, _ := strings.Cut(kind, ",")
		id += "-" + prefix + "-" + sub
	}
	return strings.Trim(unsafeIDRune.ReplaceAllString(id, "-"), "-")
}

// report is the part of `smartctl -j -a` the summary reads.
type report struct {
	Smartctl struct {
		Messages []struct {
			String string `json:"string"`
		} `json:"messages"`
	} `json:"smartctl"`
	Device struct {
		Protocol string `json:"protocol"`
	} `json:"device"`
	ModelName    string `json:"model_name"`
	SerialNumber string `json:"serial_number"`
	Firmware     string `json:"firmware_version"`
	UserCapacity struct {
		Bytes int64 `json:"bytes"`
	} `json:"user_capacity"`
	RotationRate *int64 `json:"rotation_rate"`
	SmartStatus  *struct {
		Passed bool `json:"passed"`
	} `json:"smart_status"`
	Temperature *struct {
		Current *int64 `json:"current"`
	} `json:"temperature"`
	PowerOnTime *struct {
		Hours *int64 `json:"hours"`
	} `json:"power_on_time"`
	PowerCycleCount *int64         `json:"power_cycle_count"`
	Attributes      *ataAttributes `json:"ata_smart_attributes"`
	ATAData         *struct {
		SelfTest *struct {
			Status struct {
				RemainingPercent *int `json:"remaining_percent"`
			} `json:"status"`
		} `json:"self_test"`
	} `json:"ata_smart_data"`
	ATASelfTestLog *struct {
		Standard struct {
			Table []struct {
				Type struct {
					String string `json:"string"`
				} `json:"type"`
				Status struct {
					Value  int    `json:"value"`
					String string `json:"string"`
					Passed *bool  `json:"passed"`
				} `json:"status"`
				LifetimeHours *int64 `json:"lifetime_hours"`
			} `json:"table"`
		} `json:"standard"`
	} `json:"ata_smart_self_test_log"`
	NVMeHealth  *nvmeHealth `json:"nvme_smart_health_information_log"`
	NVMeTestLog *struct {
		CompletionPercent *int `json:"current_self_test_completion_percent"`
		Table             []struct {
			Code struct {
				String string `json:"string"`
			} `json:"self_test_code"`
			Result struct {
				Value  int    `json:"value"`
				String string `json:"string"`
			} `json:"self_test_result"`
			PowerOnHours *int64 `json:"power_on_hours"`
		} `json:"table"`
	} `json:"nvme_self_test_log"`
}

type ataAttributes struct {
	Table []struct {
		ID    int   `json:"id"`
		Value int64 `json:"value"`
		Raw   struct {
			Value int64 `json:"value"`
		} `json:"raw"`
	} `json:"table"`
}

type nvmeHealth struct {
	CriticalWarning *int64 `json:"critical_warning"`
	Temperature     *int64 `json:"temperature"`
	Spare           *int64 `json:"available_spare"`
	SpareThreshold  *int64 `json:"available_spare_threshold"`
	PercentageUsed  *int64 `json:"percentage_used"`
	DataUnitsWrite  *int64 `json:"data_units_written"`
	PowerCycles     *int64 `json:"power_cycles"`
	PowerOnHours    *int64 `json:"power_on_hours"`
	MediaErrors     *int64 `json:"media_errors"`
}

// ATA attributes the summary reads.
const (
	attrReallocated   = 5
	attrPowerOnHours  = 9
	attrPowerCycles   = 12
	attrTemperature   = 194
	attrPending       = 197
	attrUncorrectable = 198
	attrCRCErrors     = 199
)

// lifeLeftAttributes hold an SSD's life left as their normalized value, by vendor: SSD_Life_Left,
// Media_Wearout_Indicator, Wear_Leveling_Count (Samsung), Percent_Lifetime_Remain (Crucial).
var lifeLeftAttributes = []int{231, 233, 177, 202}

// ParseReport summarizes `smartctl -j -a` for a device. smartctl's exit status is a bit mask
// that is often non-zero on healthy disks: only the JSON counts.
func ParseReport(device Device, data []byte) (Disk, error) {
	var parsed report
	if err := json.Unmarshal(data, &parsed); err != nil {
		return Disk{}, fmt.Errorf("read smartctl report of %s: %w", device.ID, err)
	}
	disk := Disk{
		ID: device.ID, Device: device.Name, Type: device.Type,
		Model: strings.TrimSpace(parsed.ModelName), Serial: strings.TrimSpace(parsed.SerialNumber),
		Firmware: strings.TrimSpace(parsed.Firmware), Capacity: parsed.UserCapacity.Bytes,
		Kind: kindOf(parsed), Reasons: []string{},
	}
	for _, message := range parsed.Smartctl.Messages {
		if asleepNotice.MatchString(message.String) {
			disk.Asleep = true
		}
	}
	if parsed.Temperature != nil {
		disk.Temperature = parsed.Temperature.Current
	}
	if parsed.PowerOnTime != nil {
		disk.PowerOnHours = parsed.PowerOnTime.Hours
	}
	disk.PowerCycles = parsed.PowerCycleCount
	readATA(&disk, parsed)
	readNVMe(&disk, parsed.NVMeHealth)
	disk.SelfTest = selfTestOf(parsed)
	disk.Health, disk.Reasons = Assess(disk, parsed.SmartStatus != nil && !parsed.SmartStatus.Passed,
		parsed.SmartStatus != nil, criticalWarning(parsed.NVMeHealth))
	return disk, nil
}

func kindOf(parsed report) Kind {
	switch {
	case strings.EqualFold(parsed.Device.Protocol, "NVMe"):
		return KindNVMe
	case parsed.RotationRate == nil:
		return KindUnknown
	case *parsed.RotationRate > 0:
		return KindHDD
	default:
		return KindSSD
	}
}

func readATA(disk *Disk, parsed report) {
	if parsed.Attributes == nil {
		return
	}
	raw := map[int]int64{}
	normalized := map[int]int64{}
	for _, attribute := range parsed.Attributes.Table {
		raw[attribute.ID] = attribute.Raw.Value
		normalized[attribute.ID] = attribute.Value
	}
	counter := func(id int) *int64 {
		if value, ok := raw[id]; ok {
			return &value
		}
		return nil
	}
	disk.Reallocated = counter(attrReallocated)
	disk.Pending = counter(attrPending)
	disk.Uncorrectable = counter(attrUncorrectable)
	disk.CRCErrors = counter(attrCRCErrors)
	disk.PowerOnHours = firstOf(disk.PowerOnHours, counter(attrPowerOnHours))
	disk.PowerCycles = firstOf(disk.PowerCycles, counter(attrPowerCycles))
	if temperature := counter(attrTemperature); disk.Temperature == nil && temperature != nil {
		// The raw value packs min and max in its upper bytes on many drives.
		current := *temperature & 0xff
		disk.Temperature = &current
	}
	if disk.Kind != KindSSD {
		return
	}
	for _, id := range lifeLeftAttributes {
		if left, ok := normalized[id]; ok && left <= 100 {
			wear := 100 - max(left, 0)
			disk.WearPercent = &wear
			return
		}
	}
}

func readNVMe(disk *Disk, health *nvmeHealth) {
	if health == nil {
		return
	}
	disk.Temperature = firstOf(disk.Temperature, health.Temperature)
	disk.PowerOnHours = firstOf(disk.PowerOnHours, health.PowerOnHours)
	disk.PowerCycles = firstOf(disk.PowerCycles, health.PowerCycles)
	disk.MediaErrors = health.MediaErrors
	disk.WearPercent = health.PercentageUsed
	disk.Spare = health.Spare
	disk.SpareLimit = health.SpareThreshold
	if health.DataUnitsWrite != nil {
		written := *health.DataUnitsWrite * nvmeDataUnit
		disk.BytesWritten = &written
	}
}

func criticalWarning(health *nvmeHealth) bool {
	return health != nil && health.CriticalWarning != nil && *health.CriticalWarning != 0
}

func firstOf(values ...*int64) *int64 {
	for _, value := range values {
		if value != nil {
			return value
		}
	}
	return nil
}

func selfTestOf(parsed report) SelfTest {
	var test SelfTest
	if parsed.ATAData != nil && parsed.ATAData.SelfTest != nil {
		if remaining := parsed.ATAData.SelfTest.Status.RemainingPercent; remaining != nil {
			test.Running, test.RemainingPercent = true, remaining
		}
	}
	if log := parsed.ATASelfTestLog; log != nil && len(log.Standard.Table) > 0 {
		entry := log.Standard.Table[0]
		test.Last = &SelfTestResult{
			Kind: entry.Type.String, Result: entry.Status.String,
			Passed: ataTestPassed(entry.Status.Value, entry.Status.Passed), PowerOnHours: entry.LifetimeHours,
		}
	}
	if log := parsed.NVMeTestLog; log != nil {
		if done := log.CompletionPercent; done != nil {
			remaining := 100 - min(max(*done, 0), 100)
			test.Running, test.RemainingPercent = true, &remaining
		}
		if len(log.Table) > 0 {
			entry := log.Table[0]
			test.Last = &SelfTestResult{
				Kind: entry.Code.String, Result: entry.Result.String,
				Passed: !slices.Contains(nvmeTestFailures, entry.Result.Value), PowerOnHours: entry.PowerOnHours,
			}
		}
	}
	return test
}

// nvmeTestFailures are the NVMe self-test results that mean damage (fatal error, failed
// segments); the others are a success or an abort.
var nvmeTestFailures = []int{5, 6, 7}

// ataTestPassed reads an ATA self-test entry: smartctl says "passed" when it knows; otherwise the
// status' upper nibble 3 to 8 is a failure, and an abort (1, 2) is not.
func ataTestPassed(status int, passed *bool) bool {
	if passed != nil {
		return *passed
	}
	nibble := status >> 4
	return nibble < 3 || nibble > 8
}

// Assess gives a disk's health from its counters: failing when the disk says so, a warning on
// damaged sectors, media errors, wear or a failed self-test, unknown without SMART data.
func Assess(disk Disk, smartFailed, hasStatus, critical bool) (Health, []string) {
	switch {
	case smartFailed:
		return HealthFailing, []string{ReasonSmartFailed}
	case critical:
		return HealthFailing, []string{ReasonCriticalWarning}
	}
	reasons := []string{}
	add := func(reason string, value *int64, above int64) {
		if value != nil && *value > above {
			reasons = append(reasons, reason)
		}
	}
	add(ReasonReallocated, disk.Reallocated, 0)
	add(ReasonPending, disk.Pending, 0)
	add(ReasonUncorrectable, disk.Uncorrectable, 0)
	add(ReasonMediaErrors, disk.MediaErrors, 0)
	add(ReasonWornOut, disk.WearPercent, wornOutPercent-1)
	if disk.Spare != nil && disk.SpareLimit != nil && *disk.Spare < *disk.SpareLimit {
		reasons = append(reasons, ReasonLowSpare)
	}
	if last := disk.SelfTest.Last; last != nil && !last.Passed {
		reasons = append(reasons, ReasonTestFailed)
	}
	switch {
	case len(reasons) > 0:
		return HealthWarning, reasons
	case !hasStatus:
		return HealthUnknown, reasons
	default:
		return HealthPassed, reasons
	}
}
