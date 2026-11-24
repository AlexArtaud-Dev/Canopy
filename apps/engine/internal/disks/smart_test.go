package disks

import (
	"os"
	"path/filepath"
	"slices"
	"testing"
)

func fixture(t *testing.T, name string) []byte {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("testdata", name))
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func value(n int64) *int64 { return &n }

func equal(t *testing.T, field string, got *int64, want int64) {
	t.Helper()
	if got == nil || *got != want {
		t.Errorf("%s: got %v, want %d", field, got, want)
	}
}

func TestParseScan(t *testing.T) {
	devices, err := ParseScan(fixture(t, "scan-virtual.json"))
	if err != nil {
		t.Fatal(err)
	}
	ids := make([]string, 0, len(devices))
	for _, device := range devices {
		ids = append(ids, device.ID)
	}
	if !slices.Equal(ids, []string{"sda", "sdb", "sdc", "sdd", "sde"}) || devices[0].Type != "scsi" {
		t.Errorf("got %+v", devices)
	}

	devices, err = ParseScan([]byte(`{"devices":[
		{"name":"/dev/sda","type":"megaraid,0"},
		{"name":"/dev/sda","type":"megaraid,1"},
		{"name":"/dev/nvme0","type":"nvme"},
		{"name":"/dev/nvme0","type":"nvme"},
		{"name":"/dev/../etc/x","type":"sat"},
		{"name":"sda","type":"sat"},
		{"name":"/dev/sdz","type":"sat; rm"},
		{"name":"/dev/___","type":"sat"}
	]}`))
	if err != nil {
		t.Fatal(err)
	}
	ids = ids[:0]
	for _, device := range devices {
		ids = append(ids, device.ID)
	}
	if !slices.Equal(ids, []string{"sda-megaraid-0", "sda-megaraid-1", "nvme0"}) {
		t.Errorf("got %v", ids)
	}
	if _, err := ParseScan([]byte("{")); err == nil {
		t.Error("broken scan read")
	}
}

func TestValidID(t *testing.T) {
	for id, want := range map[string]bool{"sda": true, "nvme0": true, "sda-megaraid-1": true, "": false, "-sda": false, "SDA": false, "a/b": false} {
		if ValidID(id) != want {
			t.Errorf("%q: want %v", id, want)
		}
	}
}

func TestParseReportHDD(t *testing.T) {
	disk, err := ParseReport(Device{ID: "sdb", Name: "/dev/sdb", Type: "sat"}, fixture(t, "hdd.json"))
	if err != nil {
		t.Fatal(err)
	}
	if disk.Kind != KindHDD || disk.Model != "WDC WD40EFRX-68N32N0" || disk.Serial != "WD-WCC7K0000001" ||
		disk.Firmware != "82.00A82" || disk.Capacity != 4000787030016 || disk.Device != "/dev/sdb" || disk.Asleep {
		t.Errorf("got %+v", disk)
	}
	equal(t, "temperature", disk.Temperature, 36)
	equal(t, "power-on hours", disk.PowerOnHours, 39518)
	equal(t, "power cycles", disk.PowerCycles, 112)
	equal(t, "reallocated", disk.Reallocated, 8)
	equal(t, "pending", disk.Pending, 0)
	equal(t, "uncorrectable", disk.Uncorrectable, 0)
	equal(t, "CRC errors", disk.CRCErrors, 3)
	if disk.WearPercent != nil || disk.MediaErrors != nil {
		t.Errorf("an HDD reports no wear: %+v", disk)
	}
	if disk.Health != HealthWarning || !slices.Equal(disk.Reasons, []string{ReasonReallocated, ReasonTestFailed}) {
		t.Errorf("health %s %v", disk.Health, disk.Reasons)
	}
	last := disk.SelfTest.Last
	if disk.SelfTest.Running || last == nil || last.Passed || last.Kind != "Extended offline" ||
		last.Result != "Completed: read failure" {
		t.Errorf("self-test %+v", disk.SelfTest)
	}
	equal(t, "test hours", last.PowerOnHours, 39400)
}

func TestParseReportSSD(t *testing.T) {
	disk, err := ParseReport(Device{ID: "sda", Name: "/dev/sda", Type: "sat"}, fixture(t, "ssd.json"))
	if err != nil {
		t.Fatal(err)
	}
	if disk.Kind != KindSSD || disk.Health != HealthPassed || len(disk.Reasons) != 0 {
		t.Errorf("got %+v", disk)
	}
	// No temperature field: the low byte of attribute 194.
	equal(t, "temperature", disk.Temperature, 31)
	equal(t, "power-on hours", disk.PowerOnHours, 12034)
	equal(t, "power cycles", disk.PowerCycles, 640)
	equal(t, "wear", disk.WearPercent, 4)
	if !disk.SelfTest.Running || *disk.SelfTest.RemainingPercent != 90 {
		t.Errorf("running test %+v", disk.SelfTest)
	}
	// Aborted by the host: not a failure.
	if last := disk.SelfTest.Last; last == nil || !last.Passed {
		t.Errorf("last test %+v", last)
	}
}

func TestParseReportNVMe(t *testing.T) {
	disk, err := ParseReport(Device{ID: "nvme0", Name: "/dev/nvme0", Type: "nvme"}, fixture(t, "nvme.json"))
	if err != nil {
		t.Fatal(err)
	}
	if disk.Kind != KindNVMe || disk.Health != HealthPassed {
		t.Errorf("got %+v", disk)
	}
	equal(t, "temperature", disk.Temperature, 44)
	equal(t, "power-on hours", disk.PowerOnHours, 8760)
	equal(t, "power cycles", disk.PowerCycles, 210)
	equal(t, "wear", disk.WearPercent, 3)
	equal(t, "spare", disk.Spare, 100)
	equal(t, "spare limit", disk.SpareLimit, 10)
	equal(t, "media errors", disk.MediaErrors, 0)
	equal(t, "bytes written", disk.BytesWritten, 40000000*512000)
	if !disk.SelfTest.Running || *disk.SelfTest.RemainingPercent != 70 || !disk.SelfTest.Last.Passed ||
		disk.SelfTest.Last.Kind != "Extended" {
		t.Errorf("self-test %+v", disk.SelfTest)
	}
}

func TestParseReportWithoutSmart(t *testing.T) {
	disk, err := ParseReport(Device{ID: "sda", Name: "/dev/sda", Type: "scsi"}, fixture(t, "virtual.json"))
	if err != nil {
		t.Fatal(err)
	}
	if disk.Health != HealthUnknown || disk.Model != "Msft Virtual Disk" || disk.Capacity != 758038528 {
		t.Errorf("got %+v", disk)
	}

	asleep, err := ParseReport(Device{ID: "sdc", Name: "/dev/sdc", Type: "sat"}, fixture(t, "standby.json"))
	if err != nil {
		t.Fatal(err)
	}
	if !asleep.Asleep || asleep.Kind != KindUnknown || asleep.Health != HealthUnknown || asleep.Temperature != nil {
		t.Errorf("got %+v", asleep)
	}
	if _, err := ParseReport(Device{ID: "x"}, []byte("[")); err == nil {
		t.Error("broken report read")
	}
}

func TestParseReportFailing(t *testing.T) {
	failed, _ := ParseReport(Device{ID: "sda"}, []byte(`{"smart_status":{"passed":false},"rotation_rate":7200}`))
	if failed.Health != HealthFailing || !slices.Equal(failed.Reasons, []string{ReasonSmartFailed}) {
		t.Errorf("got %s %v", failed.Health, failed.Reasons)
	}
	critical, _ := ParseReport(Device{ID: "nvme0"}, []byte(`{"device":{"protocol":"NVMe"},"smart_status":{"passed":true},
		"nvme_smart_health_information_log":{"critical_warning":4}}`))
	if critical.Health != HealthFailing || !slices.Equal(critical.Reasons, []string{ReasonCriticalWarning}) {
		t.Errorf("got %s %v", critical.Health, critical.Reasons)
	}
	worn, _ := ParseReport(Device{ID: "nvme1"}, []byte(`{"device":{"protocol":"NVMe"},"smart_status":{"passed":true},
		"nvme_smart_health_information_log":{"critical_warning":0,"percentage_used":95,"available_spare":5,
		"available_spare_threshold":10,"media_errors":2},
		"nvme_self_test_log":{"table":[{"self_test_code":{"string":"Short"},"self_test_result":{"value":7,"string":"Completed: failed segments"}}]}}`))
	want := []string{ReasonMediaErrors, ReasonWornOut, ReasonLowSpare, ReasonTestFailed}
	if worn.Health != HealthWarning || !slices.Equal(worn.Reasons, want) {
		t.Errorf("got %s %v", worn.Health, worn.Reasons)
	}
	// A life-left value above 100 is not a percentage: no wear is shown.
	odd, _ := ParseReport(Device{ID: "sdd"}, []byte(`{"rotation_rate":0,"smart_status":{"passed":true},
		"ata_smart_attributes":{"table":[{"id":231,"value":250,"raw":{"value":1}},{"id":197,"value":100,"raw":{"value":2}},
		{"id":198,"value":100,"raw":{"value":1}}]}}`))
	if odd.WearPercent != nil || !slices.Equal(odd.Reasons, []string{ReasonPending, ReasonUncorrectable}) {
		t.Errorf("got %v %v", odd.WearPercent, odd.Reasons)
	}
}

func TestATATestPassed(t *testing.T) {
	yes, no := true, false
	cases := []struct {
		status int
		passed *bool
		want   bool
	}{
		{0, nil, true},
		{0x10, nil, true},
		{0x20, nil, true},
		{0x30, nil, false},
		{0x79, nil, false},
		{0x80, nil, false},
		{0x90, nil, true},
		{0xf9, nil, true},
		{0x79, &yes, true},
		{0, &no, false},
	}
	for _, c := range cases {
		if got := ataTestPassed(c.status, c.passed); got != c.want {
			t.Errorf("status %#x passed %v: got %v", c.status, c.passed, got)
		}
	}
	_ = value
}
