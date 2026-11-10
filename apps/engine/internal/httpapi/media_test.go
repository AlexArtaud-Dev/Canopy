package httpapi

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/api"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/enginetoken"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/media"
)

type fakeMedia struct {
	info      media.Info
	probeErr  error
	streamErr error
	started   []float64
}

func (f *fakeMedia) Probe(context.Context, *os.File) (media.Info, error) {
	return f.info, f.probeErr
}

func (f *fakeMedia) Stream(_ context.Context, _ *os.File, _ media.Info, start float64, out io.Writer) error {
	if f.streamErr != nil {
		return f.streamErr
	}
	f.started = append(f.started, start)
	_, _ = out.Write([]byte("FMP4"))
	return nil
}

func mediaDeps(t *testing.T) (Deps, *fakeAudit) {
	t.Helper()
	resolver, dir := opsTree(t)
	for _, name := range []string{"docs/clip.mkv", "locked/clip.mkv"} {
		if err := os.WriteFile(filepath.Join(dir, filepath.FromSlash(name)), []byte("matroska"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	auditLog := &fakeAudit{}
	return Deps{Ops: resolver, Grants: bobCanWork, Audit: auditLog}, auditLog
}

func TestVideoStream(t *testing.T) {
	public, private, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	verifier := enginetoken.NewVerifier(public, time.Now)
	ticket := streamTicket(t, private)
	deps, auditLog := mediaDeps(t)

	if got := get(t, deps, verifier, "/v1/fs/stream?path=/docs/clip.mkv", ticket, nil); got.Code != http.StatusNotFound {
		t.Fatalf("no ffmpeg: %d", got.Code)
	}

	player := &fakeMedia{info: media.Info{Video: "hevc", Audio: "dts", Duration: 120}}
	deps.Media = player
	full := get(t, deps, verifier, "/v1/fs/stream?path=/docs/clip.mkv", ticket, nil)
	if full.Code != http.StatusOK || full.Body.String() != "FMP4" || full.Header().Get("Content-Type") != "video/mp4" {
		t.Fatalf("stream: %d %q %v", full.Code, full.Body.String(), full.Header())
	}
	seek := get(t, deps, verifier, "/v1/fs/stream?path=/docs/clip.mkv&start=61.5", ticket, nil)
	if seek.Code != http.StatusOK || len(player.started) != 2 || player.started[1] != 61.5 {
		t.Fatalf("seek: %d %v", seek.Code, player.started)
	}
	if len(auditLog.events) != 1 || auditLog.events[0].Action != "fs.preview" {
		t.Fatalf("only the first request is audited: %+v", auditLog.events)
	}

	refusals := map[string]int{
		"/v1/fs/stream?path=/docs/clip.mkv&start=500": http.StatusBadRequest,
		"/v1/fs/stream?path=/docs/a.txt":              http.StatusUnsupportedMediaType,
		"/v1/fs/stream?path=/locked/clip.mkv":         http.StatusForbidden,
		"/v1/fs/stream?path=/docs/none.mkv":           http.StatusNotFound,
		"/v1/fs/stream?path=../x.mkv":                 http.StatusBadRequest,
	}
	for target, want := range refusals {
		if got := get(t, deps, verifier, target, ticket, nil); got.Code != want {
			t.Errorf("%s: %d, want %d", target, got.Code, want)
		}
	}
	deps.Media = &fakeMedia{info: player.info, streamErr: media.ErrBusy}
	if got := get(t, deps, verifier, "/v1/fs/stream?path=/docs/clip.mkv", ticket, nil); got.Code != http.StatusServiceUnavailable {
		t.Fatalf("busy: %d", got.Code)
	}
	deps.Media = &fakeMedia{info: player.info, streamErr: errors.New("ffmpeg died")}
	if got := get(t, deps, verifier, "/v1/fs/stream?path=/docs/clip.mkv", ticket, nil); got.Code != http.StatusOK {
		t.Fatalf("a stream already started stays 200: %d", got.Code)
	}
	deps.Media = &fakeMedia{probeErr: media.ErrUnreadable}
	if got := get(t, deps, verifier, "/v1/fs/stream?path=/docs/clip.mkv", ticket, nil); got.Code != http.StatusBadRequest {
		t.Fatalf("unreadable: %d", got.Code)
	}
}

func TestMediaInfo(t *testing.T) {
	h := newJobsHarness(t)
	deps, _ := mediaDeps(t)
	info := func(d Deps, target string) (int, map[string]any) {
		recorder := get(t, d, h.verify, target, h.user, nil)
		var body map[string]any
		_ = json.Unmarshal(recorder.Body.Bytes(), &body)
		return recorder.Code, body
	}

	if code, body := info(deps, "/v1/fs/media?path=/docs/clip.mkv"); code != http.StatusOK || body["mode"] != "direct" || body["streamable"] != false {
		t.Fatalf("no ffmpeg: %d %v", code, body)
	}
	deps.Media = &fakeMedia{info: media.Info{Video: "hevc", Audio: "dts", Duration: 120, Width: 3840, Height: 2160}}
	code, body := info(deps, "/v1/fs/media?path=/docs/clip.mkv")
	if code != http.StatusOK || body["mode"] != "transcode" || body["streamable"] != true || body["audio"] != "dts" || body["duration"] != 120.0 {
		t.Fatalf("transcode: %d %v", code, body)
	}
	for target, want := range map[string]int{
		"/v1/fs/media?path=/docs/a.txt":      http.StatusBadRequest,
		"/v1/fs/media?path=/locked/clip.mkv": http.StatusForbidden,
		"/v1/fs/media?path=/docs/none.mkv":   http.StatusNotFound,
	} {
		if got, _ := info(deps, target); got != want {
			t.Errorf("%s: %d, want %d", target, got, want)
		}
	}
	deps.Media = &fakeMedia{probeErr: media.ErrUnreadable}
	if got, _ := info(deps, "/v1/fs/media?path=/docs/clip.mkv"); got != http.StatusBadRequest {
		t.Fatalf("unreadable: %d", got)
	}
	deps.Media = &fakeMedia{probeErr: errors.New("boom")}
	if got, _ := info(deps, "/v1/fs/media?path=/docs/clip.mkv"); got != http.StatusInternalServerError {
		t.Fatalf("probe failure: %d", got)
	}

	s := &server{deps: deps}
	response, _ := s.GetMediaInfo(context.Background(), api.GetMediaInfoRequestObject{
		Params: api.GetMediaInfoParams{Path: "/docs/clip.mkv"},
	})
	if _, ok := response.(api.GetMediaInfo401JSONResponse); !ok {
		t.Fatal("no principal answers 401")
	}
}
