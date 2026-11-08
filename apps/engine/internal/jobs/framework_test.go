package jobs

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"testing"
	"time"
)

type fakeSink struct {
	saves []Snapshot
	logs  []string
}

func (f *fakeSink) SaveProgress(_ context.Context, _ string, snapshot Snapshot, _ time.Time) error {
	f.saves = append(f.saves, snapshot)
	return nil
}

func (f *fakeSink) AppendLog(_ context.Context, _ string, seq int, level, line string, _ time.Time) error {
	f.logs = append(f.logs, fmt.Sprintf("%d %s %s", seq, level, line))
	return nil
}

func TestReporterThrottlesAndFlushes(t *testing.T) {
	start := time.Unix(1000, 0)
	clock := start
	sink := &fakeSink{}
	reporter := NewReporter(sink, "job", start, func() time.Time { return clock })
	ctx := context.Background()

	if err := reporter.Flush(ctx); err != nil || len(sink.saves) != 0 {
		t.Fatal("nothing to flush yet")
	}
	_ = reporter.Progress(ctx, Progress{BytesDone: 1})
	clock = clock.Add(100 * time.Millisecond)
	_ = reporter.Progress(ctx, Progress{BytesDone: 2})
	if len(sink.saves) != 1 {
		t.Fatalf("throttled: %d saves", len(sink.saves))
	}
	clock = start.Add(2 * time.Second)
	_ = reporter.Flush(ctx)
	if len(sink.saves) != 2 || sink.saves[1].BytesDone != 2 || sink.saves[1].RateBps == nil {
		t.Fatalf("flush: %+v", sink.saves)
	}
	_ = reporter.Flush(ctx)
	if len(sink.saves) != 2 {
		t.Fatal("a second flush has nothing new to save")
	}

	_ = reporter.Log(ctx, "info", "one")
	_ = reporter.Log(ctx, "warn", "two")
	if len(sink.logs) != 2 || sink.logs[1] != "2 warn two" {
		t.Fatalf("logs %v", sink.logs)
	}
}

func TestOutcome(t *testing.T) {
	coded := &Failure{Code: "files.not_found", Err: errors.New("gone")}
	cases := []struct {
		run, ctx    error
		state, code string
	}{
		{nil, nil, StateSucceeded, ""},
		{errors.New("x"), context.Canceled, StateCancelled, ""},
		{fmt.Errorf("wrapped: %w", coded), nil, StateFailed, "files.not_found"},
		{errors.New("x"), nil, StateFailed, CodeFailed},
	}
	for _, tc := range cases {
		state, code := Outcome(tc.run, tc.ctx)
		if state != tc.state || code != tc.code {
			t.Errorf("Outcome(%v, %v) = %s %s", tc.run, tc.ctx, state, code)
		}
	}
	if coded.Error() != "files.not_found: gone" || !errors.Is(coded, coded.Err) {
		t.Fatal("failure formatting")
	}
}

func TestLimitsFrom(t *testing.T) {
	raw := func(value string) json.RawMessage { return json.RawMessage(value) }
	if got := LimitsFrom(nil); got != DefaultLimits {
		t.Fatalf("defaults: %+v", got)
	}
	got := LimitsFrom(map[string]json.RawMessage{"maxConcurrent": raw("8"), "perUser": raw("1")})
	if got != (Limits{MaxConcurrent: 8, PerUser: 1}) {
		t.Fatalf("stored: %+v", got)
	}
	got = LimitsFrom(map[string]json.RawMessage{"maxConcurrent": raw("0"), "perUser": raw(`"x"`)})
	if got != DefaultLimits {
		t.Fatalf("invalid values fall back: %+v", got)
	}
}

func TestHub(t *testing.T) {
	if _, err := ParseNotice("{"); err == nil {
		t.Fatal("bad json")
	}
	if _, err := ParseNotice(`{"id":"1"}`); err == nil {
		t.Fatal("missing owner")
	}
	notice, err := ParseNotice(`{"id":"1","owner":"bob"}`)
	if err != nil || notice.Owner != "bob" {
		t.Fatalf("parse: %+v %v", notice, err)
	}

	hub := NewHub()
	bob, cancelBob := hub.Subscribe("bob")
	everyone, cancelAll := hub.Subscribe("")
	hub.Publish(notice)
	hub.Publish(Notice{ID: "2", Owner: "alice"})
	if got := <-bob; got.ID != "1" || len(bob) != 0 {
		t.Fatal("a user only sees their own jobs")
	}
	if len(everyone) != 2 {
		t.Fatal("administrators see every job")
	}
	for range subscriberBuffer + 1 {
		hub.Publish(notice) // a full buffer drops notices instead of blocking
	}
	cancelBob()
	cancelAll()
	hub.Publish(notice)
}

type plainArgs struct{}

func (plainArgs) Kind() string { return "plain" }

type labeledArgs struct{ plainArgs }

func (labeledArgs) Label() string { return "special" }

func TestDisplayKind(t *testing.T) {
	if DisplayKind(plainArgs{}) != "plain" || DisplayKind(labeledArgs{}) != "special" {
		t.Fatal("labels win over River kinds")
	}
}
