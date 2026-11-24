package disks

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/jobs"
)

// SelfTestKind names the job in River and engine.jobs.
const SelfTestKind = "disk_self_test"

// CodeSelfTestFailed is the job's failure when the disk reports damage.
const CodeSelfTestFailed = "disks.self_test_failed"

// SelfTestArgs are stored by River.
type SelfTestArgs struct {
	Job  string   `json:"jobId"`
	Disk string   `json:"disk"`
	Test TestKind `json:"test"`
}

// Kind implements river.JobArgs.
func (SelfTestArgs) Kind() string { return SelfTestKind }

// JobID implements jobs.Args.
func (a SelfTestArgs) JobID() string { return a.Job }

// startGrace is how many polls a test may take to show as running: a disk can take a moment to
// report the test it just accepted.
const startGrace = 4

// abortTimeout bounds stopping a test when the job is cancelled.
const abortTimeout = 30 * time.Second

// SelfTestHandler runs a disk's self-test as a job: the disk tests itself, the job follows its
// progress every poll and stops the test when cancelled. done runs once the test ended (to
// read the disks again).
func SelfTestHandler(reader Reader, poll time.Duration, done func(ctx context.Context)) jobs.Handler[SelfTestArgs] {
	return func(ctx context.Context, args SelfTestArgs, report *jobs.Reporter) (map[string]any, error) {
		if err := reader.StartTest(ctx, args.Disk, args.Test); err != nil {
			return nil, fmt.Errorf("start self-test: %w", err)
		}
		total := int64(100)
		seenRunning := false
		for polls := 1; ; polls++ {
			select {
			case <-ctx.Done():
				stop, cancel := context.WithTimeout(context.WithoutCancel(ctx), abortTimeout)
				defer cancel()
				return nil, errors.Join(ctx.Err(), reader.AbortTest(stop, args.Disk))
			case <-time.After(poll):
			}
			disk, err := reader.Get(ctx, args.Disk)
			if err != nil {
				return nil, fmt.Errorf("follow self-test: %w", err)
			}
			test := disk.SelfTest
			if test.Running {
				seenRunning = true
				remaining := int64(100)
				if test.RemainingPercent != nil {
					remaining = int64(*test.RemainingPercent)
				}
				if err := report.Progress(ctx, jobs.Progress{
					ItemsDone: 100 - remaining, ItemsTotal: &total, CurrentPath: SeriesName(disk),
				}); err != nil {
					return nil, fmt.Errorf("report self-test: %w", err)
				}
				continue
			}
			if !seenRunning && polls < startGrace {
				continue
			}
			done(ctx)
			return finished(disk, args.Test)
		}
	}
}

func finished(disk Disk, test TestKind) (map[string]any, error) {
	result := map[string]any{"disk": disk.ID, "name": SeriesName(disk), "test": string(test)}
	last := disk.SelfTest.Last
	if last == nil {
		return result, nil
	}
	result["result"], result["passed"] = last.Result, last.Passed
	if !last.Passed {
		return result, &jobs.Failure{Code: CodeSelfTestFailed, Err: errors.New(last.Result)}
	}
	return result, nil
}
