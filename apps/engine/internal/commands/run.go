package commands

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/authz"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/jobs"
)

// RunKind names the job.
const RunKind = "command"

// Run failures.
const (
	CodeUnavailable = "commands.unavailable"
	CodeFailed      = "commands.failed"
	CodeTimeout     = "commands.timeout"
)

// maxLogLines bounds what one run writes to its job log; parsing goes on after it.
const maxLogLines = 5000

// RunArgs are stored by River (in the engine's own schema): the plan built and authorized when
// the run was requested.
type RunArgs struct {
	Job     string        `json:"jobId"`
	Entry   string        `json:"entry"`
	Argv    []string      `json:"argv"`
	Preview []string      `json:"preview"`
	Secrets []string      `json:"secrets,omitempty"`
	WorkDir string        `json:"workDir"`
	DryRun  bool          `json:"dryRun"`
	Subject authz.Subject `json:"subject"`
}

// Kind implements river.JobArgs.
func (RunArgs) Kind() string { return RunKind }

// JobID implements jobs.Args.
func (a RunArgs) JobID() string { return a.Job }

// Launcher starts programs: a fixed prefix lowers their priority (nice, ionice) when available.
type Launcher struct {
	Prefix []string
	Env    []string
}

// NewLauncher finds nice and ionice; without them programs run at normal priority.
func NewLauncher(lookPath func(string) (string, error)) Launcher {
	launcher := Launcher{Env: []string{
		"PATH=/usr/local/bin:/usr/bin:/bin", "LANG=C.UTF-8", "LC_ALL=C.UTF-8", "HOME=" + os.TempDir(),
	}}
	if ionice, err := lookPath("ionice"); err == nil {
		launcher.Prefix = append(launcher.Prefix, ionice, "-c3")
	}
	if nice, err := lookPath("nice"); err == nil {
		launcher.Prefix = append(launcher.Prefix, nice, "-n", "10")
	}
	return launcher
}

// command builds the process: argv only (never a shell), a scrubbed environment, the work dir.
func (l Launcher) command(ctx context.Context, binary string, argv []string, dir string) *exec.Cmd {
	full := append(append(append([]string{}, l.Prefix...), binary), argv...)
	command := exec.CommandContext(ctx, full[0], full[1:]...) //nolint:gosec // catalog binary, argv built from the entry template
	command.Env = l.Env
	command.Dir = dir
	command.WaitDelay = 10 * time.Second
	return command
}

// RunHandler runs a catalog command, streaming its output to the job log and its progress.
func RunHandler(available *Available, launcher Launcher) jobs.Handler[RunArgs] {
	return func(ctx context.Context, args RunArgs, report *jobs.Reporter) (map[string]any, error) {
		entry, binary, ok := available.Get(args.Entry, true)
		if !ok {
			return nil, &jobs.Failure{Code: CodeUnavailable, Err: fmt.Errorf("%s is not installed", args.Entry)}
		}
		limited, cancel := context.WithTimeout(ctx, entry.Timeout.Duration)
		defer cancel()
		command := launcher.command(limited, binary, args.Argv, args.WorkDir)
		output, writer := io.Pipe()
		command.Stdout, command.Stderr = writer, writer
		if err := command.Start(); err != nil {
			return nil, &jobs.Failure{Code: CodeUnavailable, Err: err}
		}
		done := make(chan error, 1)
		go func() {
			err := command.Wait()
			_ = writer.Close()
			done <- err
		}()
		lines := stream(limited, output, NewParser(entry), args.Secrets, report)
		err := <-done
		result := map[string]any{"exitCode": command.ProcessState.ExitCode(), "lines": lines, "dryRun": args.DryRun}
		switch {
		case errors.Is(limited.Err(), context.DeadlineExceeded) && ctx.Err() == nil:
			return result, &jobs.Failure{Code: CodeTimeout, Err: limited.Err()}
		case ctx.Err() != nil:
			return result, fmt.Errorf("stopped: %w", ctx.Err())
		case err != nil:
			return result, &jobs.Failure{Code: CodeFailed, Err: err}
		}
		return result, nil
	}
}

// stream reads output line by line (rsync rewrites its progress line with \r), feeding the
// parser and the capped, redacted job log. It returns how many lines were read.
func stream(ctx context.Context, output io.Reader, parser Parser, secrets []string, report *jobs.Reporter) int {
	scanner := bufio.NewScanner(output)
	scanner.Buffer(make([]byte, 64*1024), 1024*1024)
	scanner.Split(ScanLines)
	progress := jobs.Progress{}
	count := 0
	for scanner.Scan() {
		line := scanner.Text()
		// Redrawn progress leaves empty pieces between the backspaces.
		if strings.TrimSpace(line) == "" {
			continue
		}
		count++
		reading := parser.Read(line)
		if apply(&progress, reading) {
			_ = report.Progress(ctx, progress)
		}
		// Progress lines repeat many times a second: they update progress, not the log.
		if reading.Percent != nil {
			continue
		}
		switch {
		case count < maxLogLines:
			_ = report.Log(ctx, "info", Redact(line, secrets))
		case count == maxLogLines:
			_ = report.Log(ctx, "warn", "output truncated")
		}
	}
	return count
}

func apply(progress *jobs.Progress, reading Reading) bool {
	changed := false
	if reading.Bytes != nil {
		progress.BytesDone = *reading.Bytes
		changed = true
	}
	if reading.Items != nil {
		progress.ItemsDone = *reading.Items
		changed = true
	}
	switch {
	case reading.Percent != nil && reading.Bytes != nil && *reading.Percent > 0:
		// rsync gives bytes so far and a percentage: the total follows.
		total := int64(float64(*reading.Bytes) * 100 / *reading.Percent)
		progress.BytesTotal = &total
		changed = true
	case reading.Percent != nil:
		// A percentage alone is shown as steps out of 100.
		hundred := int64(100)
		progress.ItemsTotal, progress.ItemsDone = &hundred, int64(*reading.Percent)
		changed = true
	}
	return changed
}

// ScanLines splits tool output on \n, \r\n, lone \r (rsync) and backspaces (7-Zip redraws its
// progress with them).
func ScanLines(data []byte, atEOF bool) (int, []byte, error) {
	if atEOF && len(data) == 0 {
		return 0, nil, nil
	}
	if i := bytes.IndexAny(data, "\r\n\b"); i >= 0 {
		advance := i + 1
		if data[i] == '\r' && i+1 < len(data) && data[i+1] == '\n' {
			advance++
		}
		return advance, data[:i], nil
	}
	if atEOF {
		return len(data), data, nil
	}
	return 0, nil, nil
}
