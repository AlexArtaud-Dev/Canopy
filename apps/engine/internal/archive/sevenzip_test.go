package archive

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/authz"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/jobs"
)

const listing = `Path = docs
Folder = +
Size = 0
Attributes = D drwxr-xr-x

Path = docs/a.txt
Size = 5
Attributes = A -rw-r--r--

Path = link
Size = 11
Attributes = A lrwxrwxrwx

Path = disc/file
Size =
`

func TestParseListing(t *testing.T) {
	entries, err := parseListing(listing)
	if err != nil {
		t.Fatal(err)
	}
	want := []listed{
		{path: "docs", dir: true}, {path: "docs/a.txt", size: 5}, {path: "link", size: 11, link: true}, {path: "disc/file"},
	}
	if len(entries) != len(want) {
		t.Fatalf("entries: %+v", entries)
	}
	for i := range want {
		if entries[i] != want[i] {
			t.Errorf("%d: %+v, want %+v", i, entries[i], want[i])
		}
	}
	if _, err := parseListing("Path = a\nSize = -3\n"); !errors.Is(err, ErrBadArchive) {
		t.Fatalf("negative size: %v", err)
	}
	if entries, _ := parseListing("Size = 4\nFolder = +\nAttributes = D\n"); len(entries) != 0 {
		t.Fatal("keys before any path are ignored")
	}
}

func TestOutputHelpers(t *testing.T) {
	if percent, ok := percentOf("42% + big"); !ok || percent != 42 {
		t.Fatal("percent")
	}
	if percent, ok := percentOf("250%"); !ok || percent != 100 {
		t.Fatal("capped at 100")
	}
	if _, ok := percentOf("Scanning"); ok {
		t.Fatal("not progress")
	}
	if !isProblem("ERROR: x") || !isProblem("Cannot open encrypted archive. Wrong password?") || isProblem("Everything is Ok") {
		t.Fatal("problems")
	}
	if err := failure([]string{"Wrong password?"}, errors.New("exit 2")); !errors.Is(err, ErrEncrypted) {
		t.Fatal("password")
	}
	if err := failure([]string{"Headers Error"}, errors.New("exit 2")); !errors.Is(err, ErrBadArchive) {
		t.Fatal("damaged")
	}
	if !external(SevenZ) || !external(Rar) || !external(Iso) || external(Zip) {
		t.Fatal("external formats")
	}
}

func TestFindSevenZip(t *testing.T) {
	missing := func(string) (string, error) { return "", exec.ErrNotFound }
	if FindSevenZip(missing, nil, "") != nil {
		t.Fatal("not installed")
	}
	found := FindSevenZip(func(string) (string, error) { return "/usr/local/bin/7zz", nil }, nil, "/tmp")
	if found == nil || found.Binary != "/usr/local/bin/7zz" || !strings.Contains(strings.Join(found.env(), " "), "TMPDIR=/tmp") {
		t.Fatalf("found: %+v", found)
	}
}

func TestWithoutSevenZip(t *testing.T) {
	files, _ := tree(t, map[string]string{"v/a.7z": "x", "v/b.txt": "b"})
	if _, err := ExtractHandler(files, nil)(context.Background(), ExtractArgs{Archive: "/v/a.7z", Subject: admin}, reporter()); !isCode(err, CodeUnavailable) {
		t.Fatalf("extract: %v", err)
	}
	args := CompressArgs{Sources: []string{"/v/b.txt"}, Folder: "/v", Format: SevenZ, Subject: admin}
	if _, err := CompressHandler(files, fakeGrants{}, nil)(context.Background(), args, reporter()); !isCode(err, CodeUnavailable) {
		t.Fatalf("compress: %v", err)
	}
	if exists, _ := files.Exists("/v/b.7z"); exists {
		t.Fatal("no partial archive")
	}
}

func isCode(err error, code string) bool {
	var failure *jobs.Failure
	return errors.As(err, &failure) && failure.Code == code
}

// realSevenZip skips where 7zz is not installed (CI and the engine images have it).
func realSevenZip(t *testing.T, dir string) *SevenZip {
	t.Helper()
	temp := t.TempDir()
	tool := FindSevenZip(exec.LookPath, func(virtual string) (string, error) {
		return filepath.Join(dir, filepath.FromSlash(virtual)), nil
	}, temp)
	if tool == nil {
		t.Skip("7zz not installed")
	}
	return tool
}

func TestSevenZipRoundTrip(t *testing.T) {
	files, dir := tree(t, map[string]string{
		"v/docs/a.txt": "alpha", "v/docs/sub/b.txt": "beta", "v/docs/private/c.txt": "secret", "v/-dash.txt": "dash",
	})
	tool := realSevenZip(t, dir)
	ctx := context.Background()
	bob := authz.Subject{UserID: "bob"}
	grants := fakeGrants{grants: []authz.Grant{
		{SubjectType: authz.SubjectUser, SubjectID: "bob", Path: "/v", Actions: authz.Actions, Effect: authz.EffectAllow},
		{SubjectType: authz.SubjectUser, SubjectID: "bob", Path: "/v/docs/private", Actions: []string{"read"}, Effect: authz.EffectDeny},
	}}
	args := CompressArgs{Sources: []string{"/v/docs", "/v/-dash.txt"}, Folder: "/v", Format: SevenZ, Subject: bob}
	result, err := CompressHandler(files, grants, tool)(ctx, args, reporter())
	if err != nil || result["path"] != "/v/v.7z" || result["items"] != int64(3) {
		t.Fatalf("compress: %v %v", result, err)
	}
	extracted, err := ExtractHandler(files, tool)(ctx, ExtractArgs{Archive: "/v/v.7z", Subject: admin}, reporter())
	if err != nil || extracted["path"] != "/v/v" || extracted["files"] != int64(3) {
		t.Fatalf("extract: %v %v", extracted, err)
	}
	if read(t, dir, "v/v/docs/sub/b.txt") != "beta" || read(t, dir, "v/v/-dash.txt") != "dash" {
		t.Fatal("content")
	}
	if _, err := os.Stat(filepath.Join(dir, "v/v/docs/private/c.txt")); err == nil {
		t.Fatal("a file the person may not read went into the archive")
	}

	// Only folders, or nothing readable: no archive.
	empty := CompressArgs{Sources: []string{"/v/docs/private"}, Folder: "/v/docs", Format: SevenZ, Subject: bob}
	if _, err := CompressHandler(files, grants, tool)(ctx, empty, reporter()); !isCode(err, CodeNothingToCompress) {
		t.Fatalf("nothing: %v", err)
	}
}

func TestSevenZipRefusals(t *testing.T) {
	files, dir := tree(t, map[string]string{"v/broken.7z": "not an archive", "v/a.txt": "a"})
	tool := realSevenZip(t, dir)
	ctx := context.Background()
	if _, err := ExtractHandler(files, tool)(ctx, ExtractArgs{Archive: "/v/broken.7z", Subject: admin}, reporter()); !isCode(err, CodeBadArchive) {
		t.Fatalf("broken: %v", err)
	}
	if exists, _ := files.Exists("/v/broken"); exists {
		t.Fatal("the folder of a failed extraction is removed")
	}

	encrypted := exec.Command(tool.Binary, "a", "-t7z", "-pSECRET", "-mhe=on", "-bso0", "-bsp0", filepath.Join(dir, "v", "secret.7z"), filepath.Join(dir, "v", "a.txt"))
	if output, err := encrypted.CombinedOutput(); err != nil {
		t.Fatalf("encrypt: %v %s", err, output)
	}
	if _, err := ExtractHandler(files, tool)(ctx, ExtractArgs{Archive: "/v/secret.7z", Subject: admin}, reporter()); !isCode(err, CodeEncrypted) {
		t.Fatalf("encrypted: %v", err)
	}

	cancelled, cancel := context.WithCancel(ctx)
	cancel()
	if _, err := tool.list(cancelled, filepath.Join(dir, "v", "secret.7z")); err == nil {
		t.Fatal("cancelled listing")
	}
}
