package metrics

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"testing"
	"time"
)

func TestParseCPU(t *testing.T) {
	times, ok := ParseCPU("cpu  100 0 50 800 50 0 0 0 0 0\ncpu0 1 2 3 4 5\n")
	if !ok || times.Total != 1000 || times.Idle != 850 {
		t.Fatalf("got %+v %v", times, ok)
	}
	for _, bad := range []string{"", "intr 1 2 3", "cpu 1 x 3 4 5"} {
		if _, ok := ParseCPU(bad); ok {
			t.Errorf("%q parsed", bad)
		}
	}
}

func TestCPUPercent(t *testing.T) {
	previous := CPUTimes{Total: 1000, Idle: 800}
	if got := CPUPercent(previous, CPUTimes{Total: 2000, Idle: 1550}); got != 25 {
		t.Errorf("got %v", got)
	}
	if got := CPUPercent(previous, previous); got != 0 {
		t.Errorf("no time passed: %v", got)
	}
	if got := CPUPercent(previous, CPUTimes{Total: 2000, Idle: 700}); got != 0 {
		t.Errorf("idle went back: %v", got)
	}
	if clampPercent(120) != 100 || clampPercent(-1) != 0 {
		t.Error("clamp")
	}
}

func TestParseMemInfo(t *testing.T) {
	memory, ok := ParseMemInfo("MemTotal:  2048 kB\nMemFree: 10 kB\nbad\nMemAvailable: x kB\nMemAvailable: 1024 kB\n")
	if !ok || memory.Total != 2048*1024 || memory.Available != 1024*1024 {
		t.Fatalf("got %+v %v", memory, ok)
	}
	if _, ok := ParseMemInfo("MemTotal: 1 kB\n"); ok {
		t.Error("parsed without MemAvailable")
	}
}

func TestParseNetDev(t *testing.T) {
	netdev := "Inter-|   Receive\n face |bytes\n" +
		"    lo: 999 1 0 0 0 0 0 0 999 1 0 0 0 0 0 0\n" +
		"  eth0: 100 1 0 0 0 0 0 0 40 1 0 0 0 0 0 0\n" +
		"  eth1: 50 1 0 0 0 0 0 0 10 1 0 0 0 0 0 0\n" +
		"  bad: 1 2\n" +
		"  odd: x 1 0 0 0 0 0 0 1 1 0 0 0 0 0 0\n"
	bytes, ok := ParseNetDev(netdev)
	if !ok || bytes.Received != 150 || bytes.Sent != 50 {
		t.Fatalf("got %+v %v", bytes, ok)
	}
	if _, ok := ParseNetDev("    lo: 1 1 0 0 0 0 0 0 1 1 0 0 0 0 0 0\n"); ok {
		t.Error("loopback only should read as nothing")
	}
}

func TestPerSecond(t *testing.T) {
	if got := PerSecond(100, 400, 30); got != 10 {
		t.Errorf("got %v", got)
	}
	if PerSecond(400, 100, 30) != 0 || PerSecond(1, 2, 0) != 0 {
		t.Error("resets and empty spans read as 0")
	}
}

func TestCatalogAndPermissions(t *testing.T) {
	if _, ok := Lookup(CPUPercentName); !ok {
		t.Fatal("cpu missing")
	}
	if _, ok := Lookup("nope"); ok {
		t.Fatal("unknown metric found")
	}
	if Permission(FamilyStorage) != "metrics:storage" {
		t.Error("permission name")
	}
	storageOnly := Visible([]string{"metrics:storage"})
	for _, definition := range storageOnly {
		if definition.Family != FamilyStorage {
			t.Errorf("%s visible without its permission", definition.Name)
		}
	}
	if len(storageOnly) == 0 || len(Visible(nil)) != 0 {
		t.Error("visibility")
	}
	if len(Visible([]string{"system:admin"})) != len(Catalog) {
		t.Error("administrators read everything")
	}
}

func TestRetentionFrom(t *testing.T) {
	if got := RetentionFrom(nil); got != DefaultRetention {
		t.Errorf("defaults: %+v", got)
	}
	values := map[string]json.RawMessage{
		"metricsRawHours":   json.RawMessage("48"),
		"metricsHourlyDays": json.RawMessage("90"),
	}
	got := RetentionFrom(values)
	if got.Raw != 48*time.Hour || got.Hourly != 90*24*time.Hour {
		t.Errorf("got %+v", got)
	}
	values["metricsRawHours"] = json.RawMessage("100000")
	values["metricsHourlyDays"] = json.RawMessage(`"x"`)
	if got := RetentionFrom(values); got != DefaultRetention {
		t.Errorf("out of range should fall back: %+v", got)
	}
}

func TestPlanQuery(t *testing.T) {
	now := time.Date(2026, 11, 14, 12, 0, 0, 0, time.UTC)
	recent := PlanQuery(now.Add(-time.Hour), now, now, 120, DefaultRetention)
	if recent.Hourly || recent.Bucket != 30*time.Second {
		t.Errorf("last hour: %+v", recent)
	}
	week := PlanQuery(now.Add(-7*24*time.Hour), now, now, 100, DefaultRetention)
	if !week.Hourly || week.Bucket != 2*time.Hour {
		t.Errorf("last week: %+v", week)
	}
	coarse := PlanQuery(now.Add(-time.Hour), now, now, 0, DefaultRetention)
	if coarse.Bucket != time.Hour {
		t.Errorf("one point: %+v", coarse)
	}
	odd := PlanQuery(now.Add(-time.Hour), now, now, 7, DefaultRetention)
	if odd.Bucket%SamplePeriod != 0 {
		t.Errorf("buckets stay aligned: %v", odd.Bucket)
	}
}

func TestSampler(t *testing.T) {
	files := map[string]string{
		"/proc/stat":    "cpu 100 0 0 900 0\n",
		"/proc/meminfo": "MemTotal: 4 kB\nMemAvailable: 1 kB\n",
		"/proc/net/dev": "eth0: 1000 0 0 0 0 0 0 0 500 0 0 0 0 0 0 0\n",
	}
	countsErr := error(nil)
	sources := Sources{
		ReadFile: func(path string) ([]byte, error) {
			content, ok := files[path]
			if !ok {
				return nil, errors.New("missing")
			}
			return []byte(content), nil
		},
		Volumes: func(context.Context) ([]Volume, error) {
			return []Volume{{Name: "data", Path: "/data"}, {Name: "gone", Path: "/gone"}}, nil
		},
		DiskUsage: func(path string) (uint64, uint64, error) {
			if path == "/gone" {
				return 0, 0, errors.New("gone")
			}
			return 30, 100, nil
		},
		Counts: func(context.Context) (Counts, error) {
			return Counts{Running: 1, Queued: 2, FailedLastHour: 3, TrashBytes: 4, ThumbnailBytes: 5}, countsErr
		},
	}
	sampler := NewSampler(sources, slog.New(slog.NewTextHandler(io.Discard, nil)))
	start := time.Date(2026, 11, 14, 12, 0, 0, 0, time.UTC)
	first := byName(sampler.Sample(context.Background(), start))
	if _, ok := first[CPUPercentName]; ok {
		t.Error("cpu needs two readings")
	}
	if first[MemoryUsedName] != 3*1024 || first[VolumeUsedName+"/data"] != 30 || first[OperationsQueued] != 2 {
		t.Errorf("first sampling: %v", first)
	}
	if _, ok := first[VolumeUsedName+"/gone"]; ok {
		t.Error("an unmeasured volume is left out")
	}
	files["/proc/stat"] = "cpu 200 0 0 1800 0\n"
	files["/proc/net/dev"] = "eth0: 4000 0 0 0 0 0 0 0 2000 0 0 0 0 0 0 0\n"
	second := byName(sampler.Sample(context.Background(), start.Add(30*time.Second)))
	if second[CPUPercentName] != 10 || second[NetworkReceivedName] != 100 || second[NetworkSentName] != 50 {
		t.Errorf("rates: %v", second)
	}
	delete(files, "/proc/stat")
	countsErr = errors.New("db down")
	sources.Volumes = nil
	third := byName(NewSampler(Sources{
		ReadFile:  sources.ReadFile,
		Volumes:   func(context.Context) ([]Volume, error) { return nil, errors.New("no root") },
		DiskUsage: sources.DiskUsage,
		Counts:    func(context.Context) (Counts, error) { return Counts{}, countsErr },
	}, slog.New(slog.NewTextHandler(io.Discard, nil))).Sample(context.Background(), start))
	if _, ok := third[OperationsRunning]; ok || third[MemoryTotalName] != 4096 {
		t.Errorf("failing sources are skipped: %v", third)
	}
}

func byName(samples []Sample) map[string]float64 {
	values := map[string]float64{}
	for _, sample := range samples {
		key := sample.Metric
		if sample.Series != "" {
			key += "/" + sample.Series
		}
		values[key] = sample.Value
	}
	return values
}
