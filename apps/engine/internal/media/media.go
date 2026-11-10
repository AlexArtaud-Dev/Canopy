// Package media decides how a video reaches the browser: played as stored when the browser can
// decode it, otherwise streamed by ffmpeg as fragmented MP4, copying what browsers already play
// and re-encoding only the rest. Everything here is pure; running ffprobe/ffmpeg is in run.go.
package media

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"
)

// Mode is how the web app should play a video.
type Mode string

const (
	// Direct means the stored file plays as is (no ffmpeg).
	Direct Mode = "direct"
	// Remux means ffmpeg repackages the streams into MP4 without re-encoding the video.
	Remux Mode = "remux"
	// Transcode means the video itself must be re-encoded.
	Transcode Mode = "transcode"
)

// Info is what ffprobe found in a file.
type Info struct {
	// Duration in seconds (0 when unknown).
	Duration float64
	Video    string
	Audio    string
	Width    int
	Height   int
}

// ErrNoVideo means the file has no video stream ffprobe could read.
var ErrNoVideo = errors.New("no video stream")

type probeOutput struct {
	Format struct {
		Duration string `json:"duration"`
	} `json:"format"`
	Streams []struct {
		CodecType string `json:"codec_type"`
		CodecName string `json:"codec_name"`
		Width     int    `json:"width"`
		Height    int    `json:"height"`
	} `json:"streams"`
}

// ParseProbe reads `ffprobe -print_format json` output (first video and audio streams).
func ParseProbe(data []byte) (Info, error) {
	var out probeOutput
	if err := json.Unmarshal(data, &out); err != nil {
		return Info{}, fmt.Errorf("read ffprobe output: %w", err)
	}
	var info Info
	if duration, err := strconv.ParseFloat(out.Format.Duration, 64); err == nil && duration > 0 && !math.IsInf(duration, 0) {
		info.Duration = duration
	}
	for _, stream := range out.Streams {
		switch {
		case stream.CodecType == "video" && info.Video == "":
			info.Video, info.Width, info.Height = strings.ToLower(stream.CodecName), stream.Width, stream.Height
		case stream.CodecType == "audio" && info.Audio == "":
			info.Audio = strings.ToLower(stream.CodecName)
		}
	}
	if info.Video == "" {
		return Info{}, ErrNoVideo
	}
	return info, nil
}

// Codecs every current browser decodes in MP4, and those Chromium-based browsers also decode in
// WebM/Matroska. Copied as is when remuxing.
var (
	mp4Video = map[string]bool{"h264": true}
	mp4Audio = map[string]bool{"aac": true, "mp3": true}
	// Played straight from the file (MP4, WebM, MKV in Chromium) when both streams are known.
	directVideo = map[string]bool{"h264": true, "vp8": true, "vp9": true, "av1": true}
	directAudio = map[string]bool{"aac": true, "mp3": true, "opus": true, "vorbis": true, "flac": true}
)

// Choose picks the cheapest way to play a file: as stored when its codecs play everywhere the
// container does, a remux when only the container or the audio is the problem, else a transcode.
// container is the file's lower-case extension (".mkv").
func Choose(info Info, container string) Mode {
	audioOK := info.Audio == "" || directAudio[info.Audio]
	if directVideo[info.Video] && audioOK && container != ".mov" && container != ".avi" {
		return Direct
	}
	if mp4Video[info.Video] {
		return Remux
	}
	return Transcode
}

// longestEdge caps transcoded video (1080p): enough for a preview, kind to the server's CPU.
const longestEdge = 1920

// StreamArgs is the ffmpeg command line streaming input as fragmented MP4 to stdout from start
// seconds: video copied when browsers decode it, otherwise H.264 (fast preset, capped at 1080p);
// first audio track copied when it is AAC/MP3, otherwise AAC stereo. Subtitles and other tracks
// are left out. Every value is a constant or a number: no file name ever reaches the arguments.
func StreamArgs(input string, info Info, start float64) []string {
	args := []string{"-hide_banner", "-loglevel", "error", "-nostdin"}
	if start > 0 {
		// Before -i: a fast seek to the keyframe before start.
		args = append(args, "-ss", strconv.FormatFloat(start, 'f', 3, 64))
	}
	args = append(args, "-i", input, "-map", "0:v:0", "-map", "0:a:0?", "-sn", "-dn")
	if mp4Video[info.Video] {
		args = append(args, "-c:v", "copy")
	} else {
		args = append(args,
			"-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
			"-vf", fmt.Sprintf("scale='min(%d,iw)':'min(%d,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2", longestEdge, longestEdge),
		)
	}
	if mp4Audio[info.Audio] {
		args = append(args, "-c:a", "copy")
	} else {
		args = append(args, "-c:a", "aac", "-b:a", "192k", "-ac", "2")
	}
	return append(args,
		"-movflags", "frag_keyframe+empty_moov+default_base_moof",
		"-f", "mp4", "pipe:1",
	)
}

// ProbeArgs is the ffprobe command line describing input as JSON.
func ProbeArgs(input string) []string {
	return []string{
		"-hide_banner", "-loglevel", "error", "-print_format", "json",
		"-show_entries", "format=duration:stream=codec_type,codec_name,width,height",
		"-i", input,
	}
}

// ParseStart reads the `start` query value: seconds, never negative, never past the end.
func ParseStart(raw string, duration float64) (float64, error) {
	if raw == "" {
		return 0, nil
	}
	start, err := strconv.ParseFloat(raw, 64)
	if err != nil || math.IsNaN(start) || math.IsInf(start, 0) || start < 0 {
		return 0, fmt.Errorf("invalid start %q", raw)
	}
	if duration > 0 && start >= duration {
		return 0, fmt.Errorf("start %q is past the end", raw)
	}
	return start, nil
}
