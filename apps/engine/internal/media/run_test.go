package media

import (
	"bytes"
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestFind(t *testing.T) {
	missing := func(string) (string, error) { return "", exec.ErrNotFound }
	if Find(missing, 2) != nil {
		t.Fatal("no ffmpeg, no player")
	}
	onlyFFmpeg := func(name string) (string, error) {
		if name == "ffmpeg" {
			return "/usr/bin/ffmpeg", nil
		}
		return "", exec.ErrNotFound
	}
	if Find(onlyFFmpeg, 2) != nil {
		t.Fatal("ffprobe is needed too")
	}
	both := func(name string) (string, error) { return "/usr/bin/" + name, nil }
	player := Find(both, 0)
	if player == nil || player.FFprobe != "/usr/bin/ffprobe" || cap(player.slots) != 1 {
		t.Fatalf("player: %+v", player)
	}
}

func TestChooseEncoder(t *testing.T) {
	both := func(name string) (string, error) { return "/usr/bin/" + name, nil }
	player := Find(both, 2)
	var tried []string
	player.try = func(_ context.Context, args []string) error {
		tried = append(tried, strings.Join(args, " "))
		return nil
	}
	if got := player.ChooseEncoder(context.Background(), "cpu"); got != CPU || len(tried) != 0 {
		t.Fatalf("cpu forced: %s %v", got, tried)
	}
	if got := player.ChooseEncoder(context.Background(), "auto"); got != NVENC || cap(player.slots) != gpuConversions {
		t.Fatalf("gpu found: %s %d", got, cap(player.slots))
	}
	player = Find(both, 2)
	player.try = func(context.Context, []string) error { return errors.New("no CUDA device") }
	if got := player.ChooseEncoder(context.Background(), "nvenc"); got != CPU || cap(player.slots) != 2 {
		t.Fatalf("no gpu: %s", got)
	}
	// The real runner, against a program that is not ffmpeg: it fails, so the CPU stays.
	player = Find(func(string) (string, error) { return "/nonexistent/ffmpeg", nil }, 1)
	if got := player.ChooseEncoder(context.Background(), "auto"); got != CPU {
		t.Fatalf("missing binary: %s", got)
	}
}

func TestStreamBusy(t *testing.T) {
	player := &Player{FFmpeg: "ffmpeg", slots: make(chan struct{}, 1)}
	player.slots <- struct{}{}
	if err := player.Stream(context.Background(), nil, Info{}, 0, &bytes.Buffer{}); !errors.Is(err, ErrBusy) {
		t.Fatalf("all slots taken: %v", err)
	}
}

func TestCapped(t *testing.T) {
	out := &capped{limit: 4}
	if _, err := out.Write([]byte("abc")); err != nil {
		t.Fatal(err)
	}
	if _, err := out.Write([]byte("de")); err == nil {
		t.Fatal("over the limit")
	}
}

// TestRealFFmpeg encodes a short HEVC + AC-3 clip, probes it and streams it converted. Skipped
// where ffmpeg is not installed (CI images and the engine-ffmpeg image have it).
func TestRealFFmpeg(t *testing.T) {
	player := Find(exec.LookPath, 1)
	if player == nil {
		t.Skip("ffmpeg and ffprobe not installed")
	}
	clip := filepath.Join(t.TempDir(), "clip.mkv")
	encode := exec.Command(player.FFmpeg, "-hide_banner", "-loglevel", "error",
		"-f", "lavfi", "-i", "testsrc=size=320x240:rate=25:duration=2,format=yuv420p",
		"-f", "lavfi", "-i", "sine=frequency=440:duration=2",
		"-c:v", "libx265", "-c:a", "ac3", clip)
	if output, err := encode.CombinedOutput(); err != nil {
		t.Skipf("this ffmpeg cannot encode the sample (%v): %s", err, output)
	}
	file, err := os.Open(clip) //nolint:gosec // test file
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = file.Close() }()

	info, err := player.Probe(context.Background(), file)
	if err != nil || info.Video != "hevc" || info.Audio != "ac3" || info.Width != 320 || info.Duration < 1.5 {
		t.Fatalf("probe: %+v %v", info, err)
	}
	if mode := Choose(info, ".mkv"); mode != Transcode {
		t.Fatalf("mode: %s", mode)
	}
	var out bytes.Buffer
	if err := player.Stream(context.Background(), file, info, 0.5, &out); err != nil {
		t.Fatal(err)
	}
	// Fragmented MP4 starts with an ftyp box.
	if out.Len() < 1000 || !bytes.Contains(out.Bytes()[:64], []byte("ftyp")) {
		t.Fatalf("not an MP4 stream: %d bytes", out.Len())
	}

	// On a machine with a usable NVIDIA GPU, the same conversion runs there.
	if player.ChooseEncoder(context.Background(), "auto") == NVENC {
		var gpu bytes.Buffer
		if err := player.Stream(context.Background(), file, info, 0.5, &gpu); err != nil {
			t.Fatalf("nvenc: %v", err)
		}
		if gpu.Len() < 1000 || !bytes.Contains(gpu.Bytes()[:64], []byte("ftyp")) {
			t.Fatalf("nvenc: not an MP4 stream: %d bytes", gpu.Len())
		}
		t.Log("converted on the GPU")
	}

	notVideo := filepath.Join(t.TempDir(), "notes.mkv")
	if err := os.WriteFile(notVideo, []byte("not a video"), 0o600); err != nil {
		t.Fatal(err)
	}
	garbage, _ := os.Open(notVideo) //nolint:gosec // test file
	defer func() { _ = garbage.Close() }()
	if _, err := player.Probe(context.Background(), garbage); !errors.Is(err, ErrUnreadable) {
		t.Fatalf("garbage: %v", err)
	}
}
