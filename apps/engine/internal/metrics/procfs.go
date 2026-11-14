// Package metrics samples values for dashboards (system, storage, operations), keeps them in
// Postgres with hourly rollups, and answers series queries filtered by the caller's permissions.
package metrics

import (
	"bufio"
	"strconv"
	"strings"
)

// CPUTimes are the cumulative jiffies of /proc/stat's first line: usage is the delta between two
// readings, so a single reading means nothing on its own.
type CPUTimes struct {
	Total uint64
	Idle  uint64
}

// ParseCPU reads the aggregate "cpu" line of /proc/stat; ok is false when it is missing or
// malformed.
func ParseCPU(stat string) (CPUTimes, bool) {
	scanner := bufio.NewScanner(strings.NewReader(stat))
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) < 5 || fields[0] != "cpu" {
			continue
		}
		var times CPUTimes
		for index, field := range fields[1:] {
			value, err := strconv.ParseUint(field, 10, 64)
			if err != nil {
				return CPUTimes{}, false
			}
			times.Total += value
			// idle and iowait both mean the CPU waited.
			if index == 3 || index == 4 {
				times.Idle += value
			}
		}
		return times, true
	}
	return CPUTimes{}, false
}

// CPUPercent is the busy share between two readings, 0 when no time passed.
func CPUPercent(previous, current CPUTimes) float64 {
	if current.Total <= previous.Total || current.Idle < previous.Idle {
		return 0
	}
	total := float64(current.Total - previous.Total)
	idle := float64(current.Idle - previous.Idle)
	return clampPercent((total - idle) / total * 100)
}

func clampPercent(value float64) float64 {
	return max(0, min(100, value))
}

// Memory is what /proc/meminfo says, in bytes.
type Memory struct {
	Total     uint64
	Available uint64
}

// ParseMemInfo reads MemTotal and MemAvailable (kB in the file); ok is false without both.
func ParseMemInfo(meminfo string) (Memory, bool) {
	var memory Memory
	var total, available bool
	scanner := bufio.NewScanner(strings.NewReader(meminfo))
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) < 2 {
			continue
		}
		value, err := strconv.ParseUint(fields[1], 10, 64)
		if err != nil {
			continue
		}
		switch fields[0] {
		case "MemTotal:":
			memory.Total, total = value*1024, true
		case "MemAvailable:":
			memory.Available, available = value*1024, true
		}
	}
	return memory, total && available
}

// NetBytes are cumulative bytes received and sent by every interface but loopback.
type NetBytes struct {
	Received uint64
	Sent     uint64
}

// ParseNetDev sums /proc/net/dev's counters over the non-loopback interfaces.
func ParseNetDev(netdev string) (NetBytes, bool) {
	var bytes NetBytes
	found := false
	scanner := bufio.NewScanner(strings.NewReader(netdev))
	for scanner.Scan() {
		name, counters, ok := strings.Cut(scanner.Text(), ":")
		if !ok || strings.TrimSpace(name) == "lo" {
			continue
		}
		fields := strings.Fields(counters)
		if len(fields) < 9 {
			continue
		}
		received, errReceived := strconv.ParseUint(fields[0], 10, 64)
		sent, errSent := strconv.ParseUint(fields[8], 10, 64)
		if errReceived != nil || errSent != nil {
			continue
		}
		bytes.Received += received
		bytes.Sent += sent
		found = true
	}
	return bytes, found
}

// PerSecond is a counter's rate between two readings; 0 when the counter went back (a reset).
func PerSecond(previous, current uint64, seconds float64) float64 {
	if seconds <= 0 || current < previous {
		return 0
	}
	return float64(current-previous) / seconds
}
