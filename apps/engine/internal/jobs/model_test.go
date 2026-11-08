package jobs

import (
	"errors"
	"testing"
	"time"
)

func ptr[T any](value T) *T { return &value }

func TestIsTerminal(t *testing.T) {
	for state, want := range map[string]bool{
		StateQueued: false, StateRunning: false,
		StateSucceeded: true, StateFailed: true, StateCancelled: true,
	} {
		if IsTerminal(state) != want {
			t.Errorf("IsTerminal(%s) != %v", state, want)
		}
	}
}

func TestEstimate(t *testing.T) {
	start := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

	early := Estimate(Progress{BytesDone: 100}, start, start.Add(500*time.Millisecond))
	if early.RateBps != nil || early.EtaSeconds != nil {
		t.Fatal("estimated before one second")
	}

	known := Estimate(Progress{BytesDone: 1000, BytesTotal: ptr(int64(5000))}, start, start.Add(10*time.Second))
	if *known.RateBps != 100 || *known.EtaSeconds != 40 {
		t.Fatalf("rate %d eta %d", *known.RateBps, *known.EtaSeconds)
	}

	unknown := Estimate(Progress{BytesDone: 1000}, start, start.Add(10*time.Second))
	if unknown.RateBps == nil || unknown.EtaSeconds != nil {
		t.Fatal("ETA without a total")
	}

	overshoot := Estimate(Progress{BytesDone: 6000, BytesTotal: ptr(int64(5000))}, start, start.Add(10*time.Second))
	if *overshoot.EtaSeconds != 0 {
		t.Fatalf("eta %d", *overshoot.EtaSeconds)
	}

	nothing := Estimate(Progress{}, start, start.Add(time.Minute))
	if nothing.RateBps != nil {
		t.Fatal("rate with no bytes")
	}
}

func TestThrottle(t *testing.T) {
	throttle := NewThrottle(time.Second)
	now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	if !throttle.Allow(now) {
		t.Fatal("first update refused")
	}
	if throttle.Allow(now.Add(500 * time.Millisecond)) {
		t.Fatal("update inside the interval allowed")
	}
	if !throttle.Allow(now.Add(time.Second)) {
		t.Fatal("update after the interval refused")
	}
}

func TestCheckPerUser(t *testing.T) {
	if err := CheckPerUser(2, DefaultLimits); err != nil {
		t.Fatal(err)
	}
	if err := CheckPerUser(3, DefaultLimits); !errors.Is(err, ErrTooMany) {
		t.Fatalf("got %v", err)
	}
	if MaxLogLines != 1000 {
		t.Fatal("log cap changed")
	}
}
