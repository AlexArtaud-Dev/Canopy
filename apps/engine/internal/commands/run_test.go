package commands

import (
	"context"
	"errors"
	"fmt"
	"os"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/jobs"
)

// The test binary doubles as the catalog's tool: FAKE_TOOL picks its behaviour.
func TestMain(m *testing.M) {
	switch os.Getenv("FAKE_TOOL") {
	case "progress":
		fmt.Print("sending incremental file list\n")
		fmt.Print("      1,000  50%  1.00MB/s  0:00:01\r      2,000 100%  1.00MB/s  0:00:00\n")
		fmt.Print("token=s3cret done\n")
		os.Exit(0)
	case "fail":
		fmt.Println("boom")
		os.Exit(3)
	case "slow":
		time.Sleep(5 * time.Second)
		os.Exit(0)
	}
	os.Exit(m.Run())
}

type logSink struct {
	mu    sync.Mutex
	lines []string
	last  jobs.Snapshot
}

func (s *logSink) SaveProgress(_ context.Context, _ string, snapshot jobs.Snapshot, _ time.Time) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.last = snapshot
	return nil
}

func (s *logSink) AppendLog(_ context.Context, _ string, _ int, _, line string, _ time.Time) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.lines = append(s.lines, line)
	return nil
}

func fakeCatalog(t *testing.T, timeout time.Duration) *Available {
	t.Helper()
	entry := Entry{
		ID: "fake.tool", Binary: "fake", Mode: ModeAdvanced, ProgressParser: ParserRsyncProgress2,
		Timeout: Duration{timeout},
	}
	return NewAvailable([]Entry{entry}, func(string) (string, error) { return os.Args[0], nil })
}

func run(ctx context.Context, t *testing.T, available *Available, mode string) (map[string]any, *logSink, error) {
	t.Helper()
	t.Setenv("FAKE_TOOL", mode)
	sink := &logSink{}
	launcher := Launcher{Env: append(os.Environ(), "FAKE_TOOL="+mode)}
	report := jobs.NewReporter(sink, "job", time.Now(), time.Now)
	result, err := RunHandler(available, launcher)(ctx, RunArgs{
		Entry: "fake.tool", WorkDir: t.TempDir(), Secrets: []string{"s3cret"},
	}, report)
	_ = report.Flush(ctx)
	return result, sink, err
}

func TestRun(t *testing.T) {
	available := fakeCatalog(t, time.Minute)
	result, sink, err := run(context.Background(), t, available, "progress")
	if err != nil || result["exitCode"] != 0 {
		t.Fatalf("run: %v %v", result, err)
	}
	joined := strings.Join(sink.lines, "|")
	if !strings.Contains(joined, "sending incremental file list") || strings.Contains(joined, "s3cret") ||
		strings.Contains(joined, "1,000") {
		t.Fatalf("log (progress lines left out, secrets hidden): %q", joined)
	}
	if sink.last.BytesDone != 2000 || sink.last.BytesTotal == nil || *sink.last.BytesTotal != 2000 {
		t.Fatalf("progress: %+v", sink.last)
	}

	var failure *jobs.Failure
	if result, _, err = run(context.Background(), t, available, "fail"); !errors.As(err, &failure) || failure.Code != CodeFailed || result["exitCode"] != 3 {
		t.Fatalf("failure: %v %v", result, err)
	}
	if _, _, err = run(context.Background(), t, fakeCatalog(t, 200*time.Millisecond), "slow"); !errors.As(err, &failure) || failure.Code != CodeTimeout {
		t.Fatalf("timeout: %v", err)
	}
	cancelled, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	if _, _, err = run(cancelled, t, available, "slow"); err == nil || errors.As(err, &failure) {
		t.Fatalf("cancelled: %v", err)
	}
	missing := NewAvailable(nil, nil)
	if _, _, err = run(context.Background(), t, missing, "progress"); !errors.As(err, &failure) || failure.Code != CodeUnavailable {
		t.Fatalf("unavailable: %v", err)
	}
	broken := NewAvailable([]Entry{{ID: "fake.tool", Binary: "x", Mode: ModeBasic, Timeout: Duration{time.Minute}}},
		func(string) (string, error) { return "/no/such/program", nil })
	if _, _, err = run(context.Background(), t, broken, "progress"); !errors.As(err, &failure) || failure.Code != CodeUnavailable {
		t.Fatalf("cannot start: %v", err)
	}
}

func TestAvailableAndLauncher(t *testing.T) {
	entries := []Entry{
		{ID: "b.tool", Binary: "present", Mode: ModeAdvanced},
		{ID: "a.tool", Binary: "present", Mode: ModeBasic},
		{ID: "c.tool", Binary: "absent", Mode: ModeBasic},
	}
	lookPath := func(name string) (string, error) {
		if name == "absent" {
			return "", errors.New("not found")
		}
		return "/usr/bin/" + name, nil
	}
	available := NewAvailable(entries, lookPath)
	if got := available.List(false); len(got) != 1 || got[0].ID != "a.tool" {
		t.Fatalf("basic: %+v", got)
	}
	if got := available.List(true); len(got) != 2 || got[0].ID != "a.tool" {
		t.Fatalf("advanced: %+v", got)
	}
	if _, binary, ok := available.Get("b.tool", true); !ok || binary != "/usr/bin/present" {
		t.Fatal("get")
	}
	if _, _, ok := available.Get("b.tool", false); ok {
		t.Fatal("advanced entries hidden in basic mode")
	}
	launcher := NewLauncher(lookPath)
	if len(launcher.Prefix) != 5 || launcher.Prefix[0] != "/usr/bin/ionice" {
		t.Fatalf("prefix: %v", launcher.Prefix)
	}
	if NewLauncher(func(string) (string, error) { return "", errors.New("no") }).Prefix != nil {
		t.Fatal("no prefix without the tools")
	}
	builtin, err := Builtin()
	ids := make([]string, 0, len(builtin))
	for _, entry := range builtin {
		ids = append(ids, entry.ID)
	}
	if err != nil || !slices.Contains(ids, "rsync.sync") || !slices.Contains(ids, "sevenzip.extract") {
		t.Fatalf("built-in: %v %v", ids, err)
	}
	progress := jobs.Progress{}
	fifty := 50.0
	if !apply(&progress, Reading{Percent: &fifty}) || *progress.ItemsTotal != 100 || progress.ItemsDone != 50 {
		t.Fatalf("percent only: %+v", progress)
	}
	if advance, token, _ := ScanLines([]byte("a\r\nb"), false); advance != 3 || string(token) != "a" {
		t.Fatal("crlf")
	}
	if advance, token, _ := ScanLines([]byte(" 42%\b\b\b\b"), false); advance != 5 || string(token) != " 42%" {
		t.Fatal("backspaces end a progress redraw")
	}
	if advance, _, _ := ScanLines([]byte("partial"), false); advance != 0 {
		t.Fatal("waits for more")
	}
	if advance, _, _ := ScanLines(nil, true); advance != 0 {
		t.Fatal("end")
	}
}
