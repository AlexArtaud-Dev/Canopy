package uploads

import (
	"context"
	"errors"
	"strings"
	"testing"

	tusd "github.com/tus/tusd/v2/pkg/handler"
)

func TestVolumeIDs(t *testing.T) {
	if VolumeOf("/media/photos/a.jpg") != "media" || VolumeOf("/media") != "media" || VolumeOf("/") != "" {
		t.Fatal("volume of a path")
	}
	id, err := NewID("media")
	if err != nil || len(id) != randomPart+10 {
		t.Fatalf("id: %s %v", id, err)
	}
	if volume, ok := VolumeOfID(id); !ok || volume != "media" {
		t.Fatalf("volume back: %s %v", volume, ok)
	}
	root, _ := NewID("")
	if volume, ok := VolumeOfID(root); !ok || volume != "" {
		t.Fatal("root uploads")
	}
	if staged, ok := StagedPath(id); !ok || staged != "media/.canopy-uploads/"+id {
		t.Fatalf("staged: %s", staged)
	}
	for _, bad := range []string{"short", strings.Repeat("a", randomPart) + "2f", strings.Repeat("z", randomPart), "../" + id} {
		if _, ok := VolumeOfID(bad); ok {
			t.Errorf("%q must be refused", bad)
		}
	}
	if _, ok := StagedPath("nope"); ok {
		t.Fatal("staged path of a bad id")
	}
}

type failingStager struct{}

func (failingStager) EnsureStagingIn(string) (string, error) { return "", errors.New("read-only") }

func TestVolumeStoresRefuse(t *testing.T) {
	stores := &volumeStores{root: t.TempDir(), stager: failingStager{}, dirs: map[string]string{}}
	id, _ := NewID("media")
	if _, err := stores.GetUpload(context.Background(), id); err == nil {
		t.Fatal("staging failure surfaces")
	}
	if _, err := stores.NewUpload(context.Background(), tusd.FileInfo{ID: id}); err == nil {
		t.Fatal("staging failure surfaces on create")
	}
	if _, err := stores.NewLock(id); err == nil {
		t.Fatal("lock needs staging too")
	}
	if _, err := stores.NewLock("bad"); !errors.Is(err, tusd.ErrNotFound) {
		t.Fatal("bad ids are not found")
	}
	if _, err := stores.GetUpload(context.Background(), "bad"); !errors.Is(err, tusd.ErrNotFound) {
		t.Fatal("bad ids are not found")
	}
	if len(stores.knownDirs()) != 0 {
		t.Fatal("nothing staged")
	}
}
