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
	// PixelFormat of the video (yuv420p, yuv420p10le…), empty when unknown.
	PixelFormat string
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
		PixFmt    string `json:"pix_fmt"`
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
			info.PixelFormat = stream.PixFmt
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

// Encoder is how a video is re-encoded when it must be.
type Encoder string

// Encoders.
const (
	// CPU encodes with libx264.
	CPU Encoder = "cpu"
	// NVENC encodes on an NVIDIA GPU (h264_nvenc) and decodes there too when it can.
	NVENC Encoder = "nvenc"
)

// gpuDecodable lists codecs NVIDIA GPUs decode (NVDEC) among those Canopy re-encodes: they stay
// on the GPU from decoding to encoding. Others are decoded and scaled on the CPU, then encoded
// on the GPU.
var gpuDecodable = map[string]bool{"hevc": true, "mpeg2video": true, "vc1": true}

// gpuPixelFormats are the 4:2:0 layouts consumer GPUs decode; 4:2:2 and 4:4:4 fall back to the
// CPU, so their frames would not be in GPU memory for the GPU scaler.
var gpuPixelFormats = map[string]bool{"yuv420p": true, "yuvj420p": true, "yuv420p10le": true, "nv12": true, "p010le": true}

// nvencRate keeps the stream around the size of a CPU encode: constant quality, capped bitrate.
var nvencRate = []string{"-preset", "p4", "-rc", "vbr", "-cq", "26", "-b:v", "0", "-maxrate", "8M", "-bufsize", "16M"}

// StreamArgs is the ffmpeg command line writing input as fragmented MP4 to stdout from start
// seconds: video copied when H.264, otherwise re-encoded with encoder; audio copied when MP4 can
// hold it, otherwise AAC stereo.
func StreamArgs(input string, info Info, start float64, encoder Encoder) []string {
	args := []string{"-hide_banner", "-loglevel", "error", "-nostdin"}
	transcode := !mp4Video[info.Video]
	onGPU := transcode && encoder == NVENC && gpuDecodable[info.Video] && gpuPixelFormats[info.PixelFormat]
	if onGPU {
		// Decoded frames stay in GPU memory: scaled and encoded there, the CPU stays idle.
		args = append(args, "-hwaccel", "cuda", "-hwaccel_output_format", "cuda")
	}
	if start > 0 {
		// Before -i: a fast seek to the keyframe before start.
		args = append(args, "-ss", strconv.FormatFloat(start, 'f', 3, 64))
	}
	args = append(args, "-i", input, "-map", "0:v:0", "-map", "0:a:0?", "-sn", "-dn")
	bounds := fmt.Sprintf("'min(%d,iw)':'min(%d,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2", longestEdge, longestEdge)
	switch {
	case !transcode:
		args = append(args, "-c:v", "copy")
	case onGPU:
		args = append(args, "-c:v", "h264_nvenc")
		args = append(args, nvencRate...)
		args = append(args, "-vf", "scale_cuda=w="+strings.Replace(bounds, ":", ":h=", 1)+":format=yuv420p")
	case encoder == NVENC:
		args = append(args, "-c:v", "h264_nvenc")
		args = append(args, nvencRate...)
		args = append(args, "-pix_fmt", "yuv420p", "-vf", "scale="+bounds)
	default:
		args = append(args, "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-vf", "scale="+bounds)
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

// NVENCProbeArgs encodes a tenth of a second of black on the GPU: it fails without a usable
// NVIDIA GPU, driver or ffmpeg build.
func NVENCProbeArgs() []string {
	return []string{
		"-hide_banner", "-loglevel", "error", "-nostdin",
		"-f", "lavfi", "-i", "color=black:s=256x144:d=0.1", "-c:v", "h264_nvenc", "-f", "null", "-",
	}
}

// ProbeArgs is the ffprobe command line describing input as JSON.
func ProbeArgs(input string) []string {
	return []string{
		"-hide_banner", "-loglevel", "error", "-print_format", "json",
		"-show_entries", "format=duration:stream=codec_type,codec_name,width,height,pix_fmt",
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
