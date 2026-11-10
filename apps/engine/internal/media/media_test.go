package media

import (
	"errors"
	"slices"
	"strings"
	"testing"
)

const probeMKV = `{"streams":[
 {"codec_type":"video","codec_name":"HEVC","width":3840,"height":2160},
 {"codec_type":"audio","codec_name":"dts"},
 {"codec_type":"audio","codec_name":"aac"},
 {"codec_type":"subtitle","codec_name":"subrip"}],
 "format":{"duration":"5423.120000"}}`

func TestParseProbe(t *testing.T) {
	info, err := ParseProbe([]byte(probeMKV))
	if err != nil {
		t.Fatal(err)
	}
	want := Info{Duration: 5423.12, Video: "hevc", Audio: "dts", Width: 3840, Height: 2160}
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
	remux := StreamArgs("/dev/fd/3", Info{Video: "h264", Audio: "aac"}, 0)
	joined := strings.Join(remux, " ")
	for _, want := range []string{"-c:v copy", "-c:a copy", "-map 0:a:0?", "-sn", "frag_keyframe+empty_moov+default_base_moof", "pipe:1"} {
		if !strings.Contains(joined, want) {
			t.Errorf("remux lacks %q: %s", want, joined)
		}
	}
	if slices.Contains(remux, "-ss") {
		t.Fatal("no seek from the start")
	}
	transcode := strings.Join(StreamArgs("/dev/fd/3", Info{Video: "hevc", Audio: "dts"}, 61.5), " ")
	for _, want := range []string{"-ss 61.500 -i /dev/fd/3", "-c:v libx264", "min(1920,iw)", "-c:a aac", "-ac 2"} {
		if !strings.Contains(transcode, want) {
			t.Errorf("transcode lacks %q: %s", want, transcode)
		}
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
