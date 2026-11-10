package media

import (
	"errors"
	"slices"
	"strings"
	"testing"
)

const probeMKV = `{"streams":[
 {"codec_type":"video","codec_name":"HEVC","width":3840,"height":2160,"pix_fmt":"yuv420p10le"},
 {"codec_type":"audio","codec_name":"dts"},
 {"codec_type":"audio","codec_name":"aac"},
 {"codec_type":"subtitle","codec_name":"subrip"}],
 "format":{"duration":"5423.120000"}}`

func TestParseProbe(t *testing.T) {
	info, err := ParseProbe([]byte(probeMKV))
	if err != nil {
		t.Fatal(err)
	}
	want := Info{Duration: 5423.12, Video: "hevc", Audio: "dts", Width: 3840, Height: 2160, PixelFormat: "yuv420p10le"}
	if info != want {
		t.Fatalf("got %+v, want %+v", info, want)
	}
	if _, err := ParseProbe([]byte(`{"streams":[{"codec_type":"audio","codec_name":"aac"}]}`)); !errors.Is(err, ErrNoVideo) {
		t.Fatal("an audio-only file has no video")
	}
	if _, err := ParseProbe([]byte("not json")); err == nil {
		t.Fatal("garbage refused")
	}
	unknown, _ := ParseProbe([]byte(`{"streams":[{"codec_type":"video","codec_name":"h264"}],"format":{"duration":"N/A"}}`))
	if unknown.Duration != 0 {
		t.Fatal("unknown duration is 0")
	}
}

func TestChoose(t *testing.T) {
	cases := []struct {
		info      Info
		container string
		want      Mode
	}{
		{Info{Video: "h264", Audio: "aac"}, ".mkv", Direct},
		{Info{Video: "vp9", Audio: "opus"}, ".webm", Direct},
		{Info{Video: "av1"}, ".mkv", Direct},
		{Info{Video: "h264", Audio: "ac3"}, ".mkv", Remux},
		{Info{Video: "h264", Audio: "aac"}, ".avi", Remux},
		{Info{Video: "hevc", Audio: "aac"}, ".mkv", Transcode},
		{Info{Video: "mpeg4", Audio: "mp3"}, ".avi", Transcode},
	}
	for _, c := range cases {
		if got := Choose(c.info, c.container); got != c.want {
			t.Errorf("%+v in %s: got %s, want %s", c.info, c.container, got, c.want)
		}
	}
}

func TestStreamArgs(t *testing.T) {
	remux := StreamArgs("/dev/fd/3", Info{Video: "h264", Audio: "aac"}, 0, NVENC)
	joined := strings.Join(remux, " ")
	for _, want := range []string{"-c:v copy", "-c:a copy", "-map 0:a:0?", "-sn", "frag_keyframe+empty_moov+default_base_moof", "pipe:1"} {
		if !strings.Contains(joined, want) {
			t.Errorf("remux lacks %q: %s", want, joined)
		}
	}
	if slices.Contains(remux, "-ss") || slices.Contains(remux, "-hwaccel") {
		t.Fatal("no seek from the start, no GPU decoding for a copy")
	}
	transcode := strings.Join(StreamArgs("/dev/fd/3", Info{Video: "hevc", Audio: "dts"}, 61.5, CPU), " ")
	for _, want := range []string{"-ss 61.500 -i /dev/fd/3", "-c:v libx264", "min(1920,iw)", "-c:a aac", "-ac 2"} {
		if !strings.Contains(transcode, want) {
			t.Errorf("transcode lacks %q: %s", want, transcode)
		}
	}
	gpu := strings.Join(StreamArgs("/dev/fd/3", Info{Video: "hevc", Audio: "aac", PixelFormat: "yuv420p10le"}, 0, NVENC), " ")
	for _, want := range []string{
		"-hwaccel cuda -hwaccel_output_format cuda -i /dev/fd/3", "-c:v h264_nvenc", "-maxrate 8M",
		"scale_cuda=w='min(1920,iw)':h='min(1920,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2:format=yuv420p",
	} {
		if !strings.Contains(gpu, want) {
			t.Errorf("nvenc lacks %q: %s", want, gpu)
		}
	}
	// A codec or a 4:4:4 picture the GPU does not decode: CPU decoding and scaling, GPU encoding.
	for _, info := range []Info{{Video: "mpeg4", Audio: "mp3", PixelFormat: "yuv420p"}, {Video: "hevc", PixelFormat: "gbrp"}} {
		hybrid := strings.Join(StreamArgs("/dev/fd/3", info, 0, NVENC), " ")
		if strings.Contains(hybrid, "-hwaccel") || !strings.Contains(hybrid, "-c:v h264_nvenc") || !strings.Contains(hybrid, "-vf scale='min(1920,iw)'") {
			t.Errorf("hybrid %+v: %s", info, hybrid)
		}
	}
	if !strings.Contains(strings.Join(NVENCProbeArgs(), " "), "-c:v h264_nvenc -f null -") {
		t.Fatal("nvenc probe")
	}
	if !strings.Contains(strings.Join(ProbeArgs("/dev/fd/3"), " "), "-print_format json") {
		t.Fatal("probe args")
	}
}

func TestParseStart(t *testing.T) {
	for raw, want := range map[string]float64{"": 0, "0": 0, "61.5": 61.5} {
		if got, err := ParseStart(raw, 120); err != nil || got != want {
			t.Errorf("%q: %v %v", raw, got, err)
		}
	}
	for _, raw := range []string{"-1", "abc", "NaN", "Inf", "120", "500"} {
		if _, err := ParseStart(raw, 120); err == nil {
			t.Errorf("%q accepted", raw)
		}
	}
	if got, err := ParseStart("500", 0); err != nil || got != 500 {
		t.Fatal("unknown duration: any start")
	}
}
