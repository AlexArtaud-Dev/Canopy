package media

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"time"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/fileinput"
)

// Errors of the runner, translated by the API.
var (
	// ErrBusy: every conversion slot is taken; the browser may try again in a moment.
	ErrBusy = errors.New("too many videos being converted")
	// ErrUnreadable: ffprobe could not read the file.
	ErrUnreadable = errors.New("unreadable video")
)

// Error codes shared with the web app.
const (
	CodeBusy       = "media.busy"
	CodeUnreadable = "media.unreadable"
)

// maxProbeOutput caps what ffprobe may write back.
const maxProbeOutput = 1 << 20

// Player runs ffprobe and ffmpeg with fixed argument lists (never a shell), the file handed over
// already open (fileinput), and at most a few conversions at once.
type Player struct {
	FFmpeg, FFprobe string
	ProbeTimeout    time.Duration
	// Encoder re-encodes videos the browser cannot play (CPU until ChooseEncoder finds a GPU).
	Encoder Encoder
	slots   chan struct{}
	// try runs ffmpeg to completion; replaced in tests.
	try func(ctx context.Context, args []string) error
}

// Find returns a player when both ffmpeg and ffprobe are installed, nil otherwise: videos then
// play only as stored.
func Find(lookPath func(string) (string, error), conversions int) *Player {
	ffmpeg, err := lookPath("ffmpeg")
	if err != nil {
		return nil
	}
	ffprobe, err := lookPath("ffprobe")
	if err != nil {
		return nil
	}
	player := &Player{
		FFmpeg: ffmpeg, FFprobe: ffprobe, ProbeTimeout: 15 * time.Second, Encoder: CPU,
		slots: make(chan struct{}, max(conversions, 1)),
	}
	player.try = func(ctx context.Context, args []string) error {
		// The binary comes from PATH at startup; every argument is a constant.
		command := exec.CommandContext(ctx, player.FFmpeg, args...) //nolint:gosec // fixed argv, no shell
		command.Stdout, command.Stderr = io.Discard, io.Discard
		return command.Run() //nolint:wrapcheck // only success matters
	}
	return player
}

// gpuConversions: a GPU encodes several videos at once without slowing the server down.
const gpuConversions = 4

// ChooseEncoder settles how videos are re-encoded, once at startup: "cpu" keeps libx264;
// "auto" and "nvenc" try a short encode on the NVIDIA GPU and use it when it works, the CPU
// otherwise.
func (p *Player) ChooseEncoder(ctx context.Context, want string) Encoder {
	p.Encoder = CPU
	if want == string(CPU) {
		return CPU
	}
	ctx, cancel := context.WithTimeout(ctx, p.ProbeTimeout)
	defer cancel()
	if p.try(ctx, NVENCProbeArgs()) == nil {
		p.Encoder = NVENC
		p.slots = make(chan struct{}, max(cap(p.slots), gpuConversions))
	}
	return p.Encoder
}

type capped struct {
	data  []byte
	limit int
}

func (c *capped) Write(chunk []byte) (int, error) {
	if len(c.data)+len(chunk) > c.limit {
		return 0, errors.New("ffprobe output too large")
	}
	c.data = append(c.data, chunk...)
	return len(chunk), nil
}

func rewind(file *os.File) error {
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return fmt.Errorf("rewind the video: %w", err)
	}
	return nil
}

// Probe describes an open video file.
func (p *Player) Probe(ctx context.Context, file *os.File) (Info, error) {
	if err := rewind(file); err != nil {
		return Info{}, err
	}
	ctx, cancel := context.WithTimeout(ctx, p.ProbeTimeout)
	defer cancel()
	// The binary comes from PATH at startup; every argument is a constant.
	command := exec.CommandContext(ctx, p.FFprobe, ProbeArgs(fileinput.Path)...) //nolint:gosec // fixed argv, no shell
	fileinput.Attach(command, file)
	output := &capped{limit: maxProbeOutput}
	command.Stdout = output
	// ffprobe's messages can quote file metadata: never kept.
	command.Stderr = io.Discard
	if err := command.Run(); err != nil {
		return Info{}, fmt.Errorf("%w: %w", ErrUnreadable, err)
	}
	info, err := ParseProbe(output.data)
	if err != nil {
		return Info{}, fmt.Errorf("%w: %w", ErrUnreadable, err)
	}
	return info, nil
}

// Stream writes the file as fragmented MP4 from start seconds until it ends or ctx is done (the
// viewer closed the player). ErrBusy when every slot is taken.
func (p *Player) Stream(ctx context.Context, file *os.File, info Info, start float64, out io.Writer) error {
	select {
	case p.slots <- struct{}{}:
		defer func() { <-p.slots }()
	default:
		return ErrBusy
	}
	if err := rewind(file); err != nil {
		return err
	}
	// The binary comes from PATH at startup; arguments are constants and numbers.
	command := exec.CommandContext(ctx, p.FFmpeg, StreamArgs(fileinput.Path, info, start, p.Encoder)...) //nolint:gosec // fixed argv, no shell
	fileinput.Attach(command, file)
	command.Stdout = out
	command.Stderr = io.Discard
	if err := command.Run(); err != nil && ctx.Err() == nil {
		return fmt.Errorf("ffmpeg: %w", err)
	}
	return nil
}
