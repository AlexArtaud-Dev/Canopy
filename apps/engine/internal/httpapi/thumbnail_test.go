package httpapi

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/api"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/enginetoken"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/fsx"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/listing"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/thumbs"
)

type fakeThumbs struct {
	data []byte
	err  error
}

func (f fakeThumbs) Current(context.Context) thumbs.Settings { return thumbs.DefaultSettings }

func (f fakeThumbs) Available(settings thumbs.Settings, name string, _ int64) bool {
	return settings.Enabled && thumbs.SourceOf(name) == thumbs.SourceImage
}

func (f fakeThumbs) Thumbnail(context.Context, string) ([]byte, string, error) {
	return f.data, "abc", f.err
}

func TestThumbnail(t *testing.T) {
	public, private, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	verifier := enginetoken.NewVerifier(public, time.Now)
	ticket := streamTicket(t, private)
	deps, _ := streamDeps(t, bobCanWork)
	jpeg := []byte("\xff\xd8\xff\xe0 thumbnail")

	deps.Thumbs = fakeThumbs{data: jpeg}
	ok := get(t, deps, verifier, "/v1/fs/thumbnail?path=/docs/a.jpg", ticket, nil)
	if ok.Code != http.StatusOK || ok.Header().Get("Content-Type") != "image/jpeg" ||
		ok.Header().Get("ETag") != `"abc"` || ok.Body.String() != string(jpeg) {
		t.Fatalf("thumbnail: %d %v", ok.Code, ok.Header())
	}
	cached := get(t, deps, verifier, "/v1/fs/thumbnail?path=/docs/a.jpg", ticket, map[string]string{"If-None-Match": `"abc"`})
	if cached.Code != http.StatusNotModified || cached.Body.Len() != 0 {
		t.Fatalf("not modified: %d", cached.Code)
	}

	refusals := []struct {
		name   string
		thumbs Thumbnails
		target string
		status int
	}{
		{"no service", nil, "/v1/fs/thumbnail?path=/docs/a.jpg", http.StatusNotFound},
		{"bad path", fakeThumbs{}, "/v1/fs/thumbnail?path=docs", http.StatusBadRequest},
		{"forbidden", fakeThumbs{}, "/v1/fs/thumbnail?path=/locked/d.jpg", http.StatusForbidden},
		{"a folder", fakeThumbs{err: fsx.ErrNotRegular}, "/v1/fs/thumbnail?path=/docs/sub", http.StatusNotFound},
		{"unsupported", fakeThumbs{err: thumbs.ErrUnsupported}, "/v1/fs/thumbnail?path=/docs/a.txt", http.StatusNotFound},
		{"too large", fakeThumbs{err: thumbs.ErrTooLarge}, "/v1/fs/thumbnail?path=/docs/a.jpg", http.StatusNotFound},
		{"disabled", fakeThumbs{err: thumbs.ErrDisabled}, "/v1/fs/thumbnail?path=/docs/a.jpg", http.StatusNotFound},
	}
	for _, tc := range refusals {
		deps.Thumbs = tc.thumbs
		if got := get(t, deps, verifier, tc.target, ticket, nil); got.Code != tc.status {
			t.Errorf("%s: %d, want %d", tc.name, got.Code, tc.status)
		}
	}
	broken := deps
	broken.Thumbs = fakeThumbs{}
	broken.Grants = fakeGrants{err: errors.New("db")}
	if got := get(t, broken, verifier, "/v1/fs/thumbnail?path=/docs/a.jpg", ticket, nil); got.Code != http.StatusInternalServerError {
		t.Fatalf("grants failure: %d", got.Code)
	}

	s := &server{deps: Deps{Logger: slog.New(slog.NewTextHandler(io.Discard, nil))}}
	recorder := httptest.NewRecorder()
	s.thumbnail(recorder, httptest.NewRequest(http.MethodGet, "/", nil))
	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("no principal: %d", recorder.Code)
	}
}

func TestToDirectoryEntry(t *testing.T) {
	ctx := context.Background()
	none := (&server{}).thumbnailRule(ctx)
	withThumbs := (&server{deps: Deps{Thumbs: fakeThumbs{}}}).thumbnailRule(ctx)

	folder := toDirectoryEntry(listing.Item{Name: "pics", Path: "/pics", IsDir: true}, withThumbs)
	if folder.Kind != api.Directory || folder.Preview != api.PreviewKind("none") || folder.Thumbnail {
		t.Fatalf("folder: %+v", folder)
	}
	photo := toDirectoryEntry(listing.Item{Name: "a.jpg", Path: "/a.jpg", Size: 3}, withThumbs)
	if photo.Kind != api.File || photo.Preview != api.PreviewKind("image") || !photo.Thumbnail {
		t.Fatalf("photo: %+v", photo)
	}
	if toDirectoryEntry(listing.Item{Name: "a.jpg", Path: "/a.jpg", Size: 3}, none).Thumbnail {
		t.Fatal("no service, no thumbnail")
	}
}
