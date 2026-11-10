package thumbs

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strconv"
	"time"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/fileinput"
)

// maxFrameBytes caps what ffmpeg may write back.
const maxFrameBytes = 8 << 20

// FrameGrabber takes one representative frame of a video with ffmpeg: a fixed argument list
// (never a shell), and the file handed over already open, so ffmpeg never resolves a path itself.
type FrameGrabber struct {
	Binary  string
	Timeout time.Duration
}

// FindFFmpeg returns a grabber when ffmpeg is installed, nil otherwise (videos keep their icon).
func FindFFmpeg(lookPath func(string) (string, error)) *FrameGrabber {
	binary, err := lookPath("ffmpeg")
	if err != nil {
		return nil
	}
	return &FrameGrabber{Binary: binary, Timeout: 20 * time.Second}
}

// Args is the ffmpeg command line for an input: `thumbnail` picks a representative frame among
// the first ones (skipping black intros), scaled to fit Edge, written as one JPEG to stdout.
func Args(input string) []string {
	edge := strconv.Itoa(Edge)
	return []string{
		"-hide_banner", "-loglevel", "error",
		"-i", input,
		"-vf", "thumbnail=48,scale=" + edge + ":" + edge + ":force_original_aspect_ratio=decrease",
		"-frames:v", "1", "-f", "image2pipe", "-c:v", "mjpeg", "-q:v", "4", "pipe:1",
	}
}

// Grab renders the frame of an open video file.
func (g *FrameGrabber) Grab(ctx context.Context, file *os.File) ([]byte, error) {
	ctx, cancel := context.WithTimeout(ctx, g.Timeout)
	defer cancel()
	// The binary comes from PATH at startup and every argument is a constant.
	command := exec.CommandContext(ctx, g.Binary, Args(fileinput.Path)...) //nolint:gosec // fixed argv, no shell
	fileinput.Attach(command, file)
	output := &cappedBuffer{limit: maxFrameBytes}
	command.Stdout = output
	// ffmpeg's messages can quote file metadata: never kept.
	command.Stderr = io.Discard
	if err := command.Run(); err != nil {
		return nil, fmt.Errorf("%w: ffmpeg: %w", ErrUnsupported, err)
	}
	if len(output.data) == 0 {
		return nil, fmt.Errorf("%w: ffmpeg wrote no frame", ErrUnsupported)
	}
	return output.data, nil
}

var errOutputTooLarge = errors.New("ffmpeg output too large")

type cappedBuffer struct {
	data  []byte
	limit int
}

func (b *cappedBuffer) Write(chunk []byte) (int, error) {
	if len(b.data)+len(chunk) > b.limit {
		return 0, errOutputTooLarge
	}
	b.data = append(b.data, chunk...)
	return len(chunk), nil
}
