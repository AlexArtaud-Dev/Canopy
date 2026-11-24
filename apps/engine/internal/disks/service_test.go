package disks

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"slices"
	"strings"
	"testing"
)

// fakeSmartctl answers like smartctl from the fixtures and records every call.
type fakeSmartctl struct {
	t     *testing.T
	calls [][]string
	fail  string
}

func (f *fakeSmartctl) exec(_ context.Context, args ...string) ([]byte, error) {
	f.calls = append(f.calls, args)
	if f.fail != "" && slices.Contains(args, f.fail) {
		return nil, errors.New("smartctl broke")
	}
	switch args[0] {
	case "--scan-open":
		return []byte(`{"devices":[{"name":"/dev/sda","type":"sat"},{"name":"/dev/sdb","type":"sat"},
			{"name":"/dev/nvme0","type":"nvme"}]}`), nil
	case "-j":
		files := map[string]string{"/dev/sda": "ssd.json", "/dev/sdb": "hdd.json", "/dev/nvme0": "nvme.json"}
		return fixture(f.t, files[args[len(args)-1]]), nil
	default:
		return nil, nil
	}
}

func serve(t *testing.T, fake *fakeSmartctl, token string) *Client {
	t.Helper()
	server := httptest.NewServer(Handler(&Smartctl{Exec: fake.exec}, token, slog.New(slog.NewTextHandler(io.Discard, nil))))
	t.Cleanup(server.Close)
	return NewClient(server.URL, "secret")
}

func TestServiceListsAndReads(t *testing.T) {
	fake := &fakeSmartctl{t: t}
	client := serve(t, fake, "secret")
	ctx := context.Background()

	disks, err := client.List(ctx)
	if err != nil || len(disks) != 3 || disks[1].ID != "sdb" || disks[1].Health != HealthWarning {
		t.Fatalf("got %+v %v", disks, err)
	}
	// Sleeping disks stay asleep.
	if read := fake.calls[1]; !slices.Equal(read, []string{"-j", "-a", "-n", "standby,0", "-d", "sat", "/dev/sda"}) {
		t.Errorf("read with %v", read)
	}
	disk, err := client.Get(ctx, "nvme0")
	if err != nil || disk.Kind != KindNVMe {
		t.Errorf("got %+v %v", disk, err)
	}
	if _, err := client.Get(ctx, "sdz"); !errors.Is(err, ErrUnknownDisk) {
		t.Errorf("unknown disk: %v", err)
	}
	if _, err := client.Get(ctx, "../x"); !errors.Is(err, ErrUnknownDisk) {
		t.Errorf("bad id: %v", err)
	}

	// A disk smartctl cannot read is left out.
	fake.fail = "/dev/sdb"
	if disks, err := client.List(ctx); err != nil || len(disks) != 2 {
		t.Errorf("got %d disks, %v", len(disks), err)
	}
	if _, err := client.Get(ctx, "sdb"); !errors.Is(err, ErrUnavailable) {
		t.Errorf("broken read: %v", err)
	}
	fake.fail = "--scan-open"
	if _, err := client.List(ctx); !errors.Is(err, ErrUnavailable) {
		t.Errorf("broken scan: %v", err)
	}
}

func TestServiceSelfTests(t *testing.T) {
	fake := &fakeSmartctl{t: t}
	client := serve(t, fake, "secret")
	ctx := context.Background()

	if err := client.StartTest(ctx, "sdb", TestLong); err != nil {
		t.Fatal(err)
	}
	if last := fake.calls[len(fake.calls)-1]; !slices.Equal(last, []string{"-t", "long", "-d", "sat", "/dev/sdb"}) {
		t.Errorf("started with %v", last)
	}
	if err := client.AbortTest(ctx, "sdb"); err != nil {
		t.Fatal(err)
	}
	if last := fake.calls[len(fake.calls)-1]; !slices.Equal(last, []string{"-X", "-d", "sat", "/dev/sdb"}) {
		t.Errorf("aborted with %v", last)
	}
	if err := client.StartTest(ctx, "sdb", "erase"); !errors.Is(err, ErrUnknownTest) {
		t.Errorf("unknown test: %v", err)
	}
	if err := client.StartTest(ctx, "sdz", TestShort); !errors.Is(err, ErrUnknownDisk) {
		t.Errorf("unknown disk: %v", err)
	}
	if err := client.AbortTest(ctx, "sdz"); !errors.Is(err, ErrUnknownDisk) {
		t.Errorf("unknown disk: %v", err)
	}
	for _, call := range []func() error{
		func() error { return client.StartTest(ctx, "A/B", TestShort) },
		func() error { return client.AbortTest(ctx, "A/B") },
	} {
		if err := call(); !errors.Is(err, ErrUnknownDisk) {
			t.Errorf("bad id: %v", err)
		}
	}
	fake.fail = "--scan-open"
	if err := client.StartTest(ctx, "sdb", TestShort); !errors.Is(err, ErrUnavailable) {
		t.Errorf("broken scan: %v", err)
	}
	if err := client.AbortTest(ctx, "sdb"); !errors.Is(err, ErrUnavailable) {
		t.Errorf("broken scan: %v", err)
	}
}

func TestServiceRefusesWithoutToken(t *testing.T) {
	ctx := context.Background()
	wrong := serve(t, &fakeSmartctl{t: t}, "other")
	if _, err := wrong.List(ctx); !errors.Is(err, ErrUnavailable) || !strings.Contains(err.Error(), "401") {
		t.Errorf("wrong token: %v", err)
	}
	// No token configured: nothing is served, whatever is sent.
	if _, err := serve(t, &fakeSmartctl{t: t}, "").List(ctx); !errors.Is(err, ErrUnavailable) {
		t.Errorf("empty token: %v", err)
	}
	response, err := http.Get(wrong.BaseURL + "/healthz")
	if err != nil || response.StatusCode != http.StatusNoContent {
		t.Errorf("healthz: %v %v", response, err)
	}
	_ = response.Body.Close()

	// A malformed self-test request.
	request, _ := http.NewRequestWithContext(ctx, http.MethodPost, wrong.BaseURL+"/v1/disks/sda/self-test", strings.NewReader("{"))
	request.Header.Set("Authorization", "Bearer other")
	response, err = http.DefaultClient.Do(request)
	if err != nil || response.StatusCode != http.StatusBadRequest {
		t.Errorf("bad body: %v %v", response, err)
	}
	_ = response.Body.Close()
}

func TestClientFailures(t *testing.T) {
	ctx := context.Background()
	if _, err := NewClient("http://127.0.0.1:1", "x").List(ctx); !errors.Is(err, ErrUnavailable) {
		t.Errorf("unreachable: %v", err)
	}
	garbage := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("not json"))
	}))
	defer garbage.Close()
	if _, err := NewClient(garbage.URL, "x").List(ctx); !errors.Is(err, ErrUnavailable) {
		t.Errorf("garbage: %v", err)
	}
	if _, err := NewClient("http://bad host", "x").List(ctx); err == nil {
		t.Error("bad URL accepted")
	}
	if err := NewClient(garbage.URL, "x").do(ctx, http.MethodPost, "/", func() {}, nil); err == nil {
		t.Error("unencodable body accepted")
	}
}

func TestSmartctlRefusesBadIDs(t *testing.T) {
	smartctl := &Smartctl{Exec: (&fakeSmartctl{t: t}).exec}
	if _, err := smartctl.Get(context.Background(), "../sda"); !errors.Is(err, ErrUnknownDisk) {
		t.Errorf("got %v", err)
	}
}

func TestSystemExec(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("PATH", dir)
	if _, err := SystemExec(context.Background(), "--version"); err == nil {
		t.Error("smartctl found in an empty PATH")
	}
	// smartctl exits with a non-zero bit mask on healthy disks: its output still counts.
	script, name := "#!/bin/sh\necho '{}'\nexit 4\n", "smartctl"
	if runtime.GOOS == "windows" {
		script, name = "@echo {}\r\n@exit /b 4\r\n", "smartctl.bat"
	}
	if err := os.WriteFile(filepath.Join(dir, name), []byte(script), 0o700); err != nil {
		t.Fatal(err)
	}
	output, err := SystemExec(context.Background(), "-j")
	if err != nil || strings.TrimSpace(string(output)) != "{}" {
		t.Errorf("got %q %v", output, err)
	}
}
