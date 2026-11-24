package disks

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/jobs"
)

type progressSink struct {
	done []int64
	err  error
}

func (s *progressSink) SaveProgress(_ context.Context, _ string, snapshot jobs.Snapshot, _ time.Time) error {
	s.done = append(s.done, snapshot.ItemsDone)
	return s.err
}

func (*progressSink) AppendLog(context.Context, string, int, string, string, time.Time) error {
	return nil
}

// scriptedDisk plays a self-test: each Get returns the next state.
type scriptedDisk struct {
	states   []Disk
	gets     int
	started  TestKind
	aborted  bool
	startErr error
	getErr   error
}

func (s *scriptedDisk) List(context.Context) ([]Disk, error) { return nil, nil }

func (s *scriptedDisk) Get(context.Context, string) (Disk, error) {
	if s.getErr != nil {
		return Disk{}, s.getErr
	}
	state := s.states[min(s.gets, len(s.states)-1)]
	s.gets++
	return state, nil
}

func (s *scriptedDisk) StartTest(_ context.Context, _ string, kind TestKind) error {
	s.started = kind
	return s.startErr
}

func (s *scriptedDisk) AbortTest(context.Context, string) error {
	s.aborted = true
	return nil
}

func running(remaining *int) Disk {
	return Disk{ID: "sdb", Model: "WD", SelfTest: SelfTest{Running: true, RemainingPercent: remaining}}
}

func ended(passed bool, result string) Disk {
	return Disk{ID: "sdb", Model: "WD", SelfTest: SelfTest{Last: &SelfTestResult{Kind: "Short offline", Result: result, Passed: passed}}}
}

func runTest(t *testing.T, disk *scriptedDisk, sink *progressSink) (map[string]any, bool, error) {
	t.Helper()
	refreshed := false
	handler := SelfTestHandler(disk, time.Millisecond, func(context.Context) { refreshed = true })
	report := jobs.NewReporter(sink, "job", time.Now(), time.Now)
	result, err := handler(context.Background(), SelfTestArgs{Job: "job", Disk: "sdb", Test: TestShort}, report)
	return result, refreshed, err
}

func TestSelfTestPasses(t *testing.T) {
	ninety, ten := 90, 10
	disk := &scriptedDisk{states: []Disk{running(&ninety), running(&ten), running(nil), ended(true, "Completed without error")}}
	sink := &progressSink{}
	result, refreshed, err := runTest(t, disk, sink)
	if err != nil || result["passed"] != true || result["name"] != "WD" || disk.started != TestShort || !refreshed {
		t.Fatalf("got %v %v", result, err)
	}
	if (SelfTestArgs{Job: "j"}).JobID() != "j" || (SelfTestArgs{}).Kind() != SelfTestKind {
		t.Error("args")
	}
}

func TestSelfTestFails(t *testing.T) {
	disk := &scriptedDisk{states: []Disk{ended(false, "Completed: read failure")}}
	result, _, err := runTest(t, disk, &progressSink{})
	var failure *jobs.Failure
	if !errors.As(err, &failure) || failure.Code != CodeSelfTestFailed || result["passed"] != false {
		t.Fatalf("got %v %v", result, err)
	}
	// It waited for the test to show before taking the old result as the outcome.
	if disk.gets != startGrace {
		t.Errorf("polled %d times", disk.gets)
	}
}

func TestSelfTestWithoutLog(t *testing.T) {
	result, _, err := runTest(t, &scriptedDisk{states: []Disk{{ID: "sdb"}}}, &progressSink{})
	if err != nil || result["passed"] != nil {
		t.Fatalf("got %v %v", result, err)
	}
}

func TestSelfTestErrors(t *testing.T) {
	broken := errors.New("broken")
	if _, _, err := runTest(t, &scriptedDisk{startErr: broken}, &progressSink{}); !errors.Is(err, broken) {
		t.Errorf("start: %v", err)
	}
	if _, _, err := runTest(t, &scriptedDisk{getErr: broken}, &progressSink{}); !errors.Is(err, broken) {
		t.Errorf("follow: %v", err)
	}
	half := 50
	if _, _, err := runTest(t, &scriptedDisk{states: []Disk{running(&half)}}, &progressSink{err: broken}); !errors.Is(err, broken) {
		t.Errorf("progress: %v", err)
	}
}

func TestSelfTestCancelAborts(t *testing.T) {
	half := 50
	disk := &scriptedDisk{states: []Disk{running(&half)}}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	handler := SelfTestHandler(disk, time.Hour, func(context.Context) {})
	_, err := handler(ctx, SelfTestArgs{Disk: "sdb", Test: TestLong}, jobs.NewReporter(&progressSink{}, "job", time.Now(), time.Now))
	if !errors.Is(err, context.Canceled) || !disk.aborted {
		t.Fatalf("got %v, aborted %v", err, disk.aborted)
	}
}
