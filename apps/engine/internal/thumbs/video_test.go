package thumbs

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// The test binary doubles as a fake ffmpeg: what it does is chosen by FAKE_FFMPEG.
func TestMain(m *testing.M) {
	switch os.Getenv("FAKE_FFMPEG") {
	case "frame":
		_, _ = os.Stdout.WriteString("\xff\xd8frame")
		os.Exit(0)
	case "nothing":
		os.Exit(0)
	case "fail":
		os.Exit(1)
	}
	os.Exit(m.Run())
}

func TestGrab(t *testing.T) {
	video := filepath.Join(t.TempDir(), "clip.mp4")
	if err := os.WriteFile(video, []byte("video"), 0o600); err != nil {
		t.Fatal(err)
	}
	grabber := &FrameGrabber{Binary: os.Args[0], Timeout: 10 * time.Second}
	grab := func(mode string) ([]byte, error) {
		t.Setenv("FAKE_FFMPEG", mode)
		file, err := os.Open(video)
		if err != nil {
			t.Fatal(err)
		}
		defer func() { _ = file.Close() }()
		return grabber.Grab(context.Background(), file)
	}
	if frame, err := grab("frame"); err != nil || string(frame) != "\xff\xd8frame" {
		t.Fatalf("frame: %q %v", frame, err)
	}
	if _, err := grab("nothing"); !errors.Is(err, ErrUnsupported) {
		t.Fatalf("no frame: %v", err)
	}
	if _, err := grab("fail"); !errors.Is(err, ErrUnsupported) {
		t.Fatalf("ffmpeg failed: %v", err)
	}
}
