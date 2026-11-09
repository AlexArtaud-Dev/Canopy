package thumbs

import (
	"encoding/json"
	"testing"
	"time"
)

func TestFit(t *testing.T) {
	cases := []struct{ w, h, wantW, wantH int }{
		{100, 50, 100, 50},
		{0, 0, 1, 1},
		{1000, 500, 320, 160},
		{500, 1000, 160, 320},
		{10000, 1, 320, 1},
	}
	for _, c := range cases {
		if w, h := Fit(c.w, c.h, Edge); w != c.wantW || h != c.wantH {
			t.Errorf("Fit(%d, %d) = %d×%d, want %d×%d", c.w, c.h, w, h, c.wantW, c.wantH)
		}
	}
}

func TestKey(t *testing.T) {
	at := time.Unix(100, 0)
	key := Key("/a.jpg", 10, at)
	if len(key) != 64 || key != Key("/a.jpg", 10, at) {
		t.Fatalf("stable hex key: %q", key)
	}
	for _, other := range []string{Key("/b.jpg", 10, at), Key("/a.jpg", 11, at), Key("/a.jpg", 10, at.Add(time.Nanosecond))} {
		if other == key {
			t.Fatal("any change gives a new key")
		}
	}
}

func TestSourceOf(t *testing.T) {
	cases := map[string]Source{
		"a.JPG": SourceImage, "b.webp": SourceImage, "c.MKV": SourceVideo,
		"d.svg": SourceNone, "e.txt": SourceNone, "noext": SourceNone,
	}
	for name, want := range cases {
		if got := SourceOf(name); got != want {
			t.Errorf("SourceOf(%q) = %d, want %d", name, got, want)
		}
	}
}

func TestSettingsFrom(t *testing.T) {
	if got := SettingsFrom(nil); got != DefaultSettings {
		t.Fatalf("defaults: %+v", got)
	}
	got := SettingsFrom(map[string]json.RawMessage{"enabled": json.RawMessage("false"), "maxCacheMb": json.RawMessage("16")})
	if got.Enabled || got.MaxCacheBytes != 16<<20 {
		t.Fatalf("stored: %+v", got)
	}
	got = SettingsFrom(map[string]json.RawMessage{"enabled": json.RawMessage(`"no"`), "maxCacheMb": json.RawMessage("0")})
	if got != DefaultSettings {
		t.Fatalf("invalid values keep defaults: %+v", got)
	}
}

func TestEvictions(t *testing.T) {
	at := time.Unix(0, 0)
	entries := []Cached{
		{Key: "new", Bytes: 10, UsedAt: at.Add(3 * time.Hour)},
		{Key: "old", Bytes: 10, UsedAt: at.Add(time.Hour)},
		{Key: "mid", Bytes: 10, UsedAt: at.Add(2 * time.Hour)},
	}
	if got := Evictions(entries, 30); len(got) != 0 {
		t.Fatalf("fits: %v", got)
	}
	got := Evictions(entries, 15)
	if len(got) != 2 || got[0] != "old" || got[1] != "mid" {
		t.Fatalf("least recently used first: %v", got)
	}
	if got := Evictions(entries, 0); len(got) != 3 {
		t.Fatalf("all: %v", got)
	}
}

func TestArgsAndCappedBuffer(t *testing.T) {
	args := Args("pipe:0")
	if args[3] != "-i" || args[4] != "pipe:0" || args[len(args)-1] != "pipe:1" {
		t.Fatalf("args: %v", args)
	}
	if FindFFmpeg(func(string) (string, error) { return "", errOutputTooLarge }) != nil {
		t.Fatal("no ffmpeg, no grabber")
	}
	if grabber := FindFFmpeg(func(string) (string, error) { return "/usr/bin/ffmpeg", nil }); grabber == nil || grabber.Binary != "/usr/bin/ffmpeg" {
		t.Fatal("ffmpeg found")
	}
	buffer := &cappedBuffer{limit: 4}
	if n, err := buffer.Write([]byte("abc")); n != 3 || err != nil {
		t.Fatal("within the cap")
	}
	if _, err := buffer.Write([]byte("de")); err == nil {
		t.Fatal("past the cap")
	}
}
