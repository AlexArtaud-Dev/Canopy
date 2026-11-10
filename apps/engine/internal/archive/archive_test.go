package archive

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"compress/gzip"
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/authz"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/fsx"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/jobs"
)

type nopSink struct{}

func (nopSink) SaveProgress(context.Context, string, jobs.Snapshot, time.Time) error { return nil }

func (nopSink) AppendLog(context.Context, string, int, string, string, time.Time) error {
	return nil
}

type fakeGrants struct {
	grants []authz.Grant
	err    error
}

func (f fakeGrants) GrantsFor(context.Context, authz.Subject) ([]authz.Grant, error) {
	return f.grants, f.err
}

func reporter() *jobs.Reporter { return jobs.NewReporter(nopSink{}, "job", time.Now(), time.Now) }

var admin = authz.Subject{UserID: "root", Admin: true}

type tight struct{ *fsx.Resolver }

// FreeSpace pretends the disk is nearly full.
func (tight) FreeSpace(string) (uint64, bool) { return 4, true }

func tree(t *testing.T, files map[string]string) (*fsx.Resolver, string) {
	t.Helper()
	dir := t.TempDir()
	for name, content := range files {
		full := filepath.Join(dir, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(full, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	resolver, err := fsx.OpenResolver(dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = resolver.Close() })
	return resolver, dir
}

func read(t *testing.T, dir, name string) string {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(dir, filepath.FromSlash(name)))
	if err != nil {
		t.Fatalf("read %s: %v", name, err)
	}
	return string(data)
}

func TestCompressThenExtract(t *testing.T) {
	for _, format := range []Format{Zip, TarGz} {
		t.Run(string(format), func(t *testing.T) {
			files, dir := tree(t, map[string]string{
				"v/docs/a.txt": "alpha", "v/docs/sub/b.txt": "beta", "v/notes.md": "notes",
				"v/docs/private/c.txt": "secret",
			})
			ctx := context.Background()
			bob := authz.Subject{UserID: "bob"}
			grants := fakeGrants{grants: []authz.Grant{
				{SubjectType: authz.SubjectUser, SubjectID: "bob", Path: "/v", Actions: authz.Actions, Effect: authz.EffectAllow},
				{SubjectType: authz.SubjectUser, SubjectID: "bob", Path: "/v/docs/private", Actions: []string{"read"}, Effect: authz.EffectDeny},
			}}
			args := CompressArgs{Sources: []string{"/v/docs", "/v/notes.md"}, Folder: "/v", Format: format, Subject: bob}
			result, err := CompressHandler(files, grants, nil)(ctx, args, reporter())
			if err != nil {
				t.Fatal(err)
			}
			archive := "/v/v." + string(format)
			if result["path"] != archive || result["skipped"] != int64(1) {
				t.Fatalf("compress: %v", result)
			}
			// A second archive gets a free name.
			again, err := CompressHandler(files, grants, nil)(ctx, args, reporter())
			if err != nil || again["path"] != "/v/v (2)."+string(format) {
				t.Fatalf("free name: %v %v", again, err)
			}

			extracted, err := ExtractHandler(files, nil)(ctx, ExtractArgs{Archive: archive, Subject: admin}, reporter())
			if err != nil {
				t.Fatal(err)
			}
			if extracted["path"] != "/v/v" || extracted["files"] != int64(3) {
				t.Fatalf("extract: %v", extracted)
			}
			if read(t, dir, "v/v/docs/sub/b.txt") != "beta" || read(t, dir, "v/v/notes.md") != "notes" {
				t.Fatalf("contents: %q %q", read(t, dir, "v/v/docs/sub/b.txt"), read(t, dir, "v/v/notes.md"))
			}
			if _, err := os.Stat(filepath.Join(dir, "v/v/docs/private")); !errors.Is(err, os.ErrNotExist) {
				t.Fatal("what bob may not read stays out")
			}
		})
	}
}

func TestCompressRefusals(t *testing.T) {
	files, _ := tree(t, map[string]string{"v/a.txt": "alpha"})
	ctx := context.Background()
	args := CompressArgs{Sources: []string{"/v/a.txt"}, Folder: "/v", Format: Zip, Subject: admin}
	if _, err := CompressHandler(tight{files}, fakeGrants{}, nil)(ctx, args, reporter()); err == nil {
		t.Fatal("no space")
	}
	if _, err := CompressHandler(files, fakeGrants{err: errors.New("db")}, nil)(ctx, CompressArgs{Subject: authz.Subject{UserID: "bob"}}, reporter()); err == nil {
		t.Fatal("grants failure")
	}
	missing := args
	missing.Sources = []string{"/v/none.txt"}
	if _, err := CompressHandler(files, fakeGrants{}, nil)(ctx, missing, reporter()); !errors.Is(err, fsx.ErrNotFound) {
		t.Fatalf("missing source: %v", err)
	}
	cancelled, cancel := context.WithCancel(ctx)
	cancel()
	if _, err := CompressHandler(files, fakeGrants{}, nil)(cancelled, CompressArgs{Sources: []string{"/v"}, Folder: "/", Format: Zip, Subject: admin}, reporter()); err == nil {
		t.Fatal("cancelled")
	}
}

func zipOf(t *testing.T, entries map[string]string) []byte {
	t.Helper()
	var out bytes.Buffer
	writer := zip.NewWriter(&out)
	for name, content := range entries {
		w, err := writer.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		_, _ = w.Write([]byte(content))
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return out.Bytes()
}

func tarOf(t *testing.T, headers []*tar.Header, gzipped bool) []byte {
	t.Helper()
	var out bytes.Buffer
	sink := &out
	var compressor *gzip.Writer
	writer := tar.NewWriter(sink)
	if gzipped {
		compressor = gzip.NewWriter(&out)
		writer = tar.NewWriter(compressor)
	}
	for _, header := range headers {
		if err := writer.WriteHeader(header); err != nil {
			t.Fatal(err)
		}
		if header.Size > 0 {
			_, _ = writer.Write(bytes.Repeat([]byte("x"), int(header.Size)))
		}
	}
	_ = writer.Close()
	if compressor != nil {
		_ = compressor.Close()
	}
	return out.Bytes()
}

func extract(t *testing.T, name string, files Files) (map[string]any, error) {
	t.Helper()
	return ExtractHandler(files, nil)(context.Background(), ExtractArgs{Archive: "/v/" + name, Subject: admin}, reporter())
}

func TestExtractGuards(t *testing.T) {
	cases := []struct {
		name string
		data func(t *testing.T) []byte
		code string
	}{
		{"slip.zip", func(t *testing.T) []byte { return zipOf(t, map[string]string{"../evil.txt": "x"}) }, CodeBadArchive},
		{"absolute.zip", func(t *testing.T) []byte { return zipOf(t, map[string]string{"/etc/passwd": "x"}) }, CodeBadArchive},
		{"reserved.zip", func(t *testing.T) []byte { return zipOf(t, map[string]string{".canopy-trash/x": "x"}) }, CodeBadArchive},
		{"broken.zip", func(*testing.T) []byte { return []byte("not a zip") }, CodeBadArchive},
		{"broken.tar.gz", func(*testing.T) []byte { return []byte("not gzip") }, CodeBadArchive},
		{"slip.tar", func(t *testing.T) []byte {
			return tarOf(t, []*tar.Header{{Name: "a/../../evil", Typeflag: tar.TypeReg, Size: 1, Mode: 0o644}}, false)
		}, CodeBadArchive},
		{"broken.tar", func(*testing.T) []byte { return bytes.Repeat([]byte{1}, 1024) }, CodeBadArchive},
		{"readme.txt", func(*testing.T) []byte { return []byte("text") }, CodeNotArchive},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			files, dir := tree(t, map[string]string{"v/" + tc.name: string(tc.data(t))})
			_, err := extract(t, tc.name, files)
			var failure *jobs.Failure
			if !errors.As(err, &failure) || failure.Code != tc.code {
				t.Fatalf("got %v, want %s", err, tc.code)
			}
			entries, _ := os.ReadDir(filepath.Join(dir, "v"))
			if len(entries) != 1 {
				t.Fatalf("the partial folder is removed: %v", entries)
			}
			if _, err := os.Stat(filepath.Join(filepath.Dir(dir), "evil.txt")); err == nil {
				t.Fatal("nothing escapes")
			}
		})
	}
}

func TestExtractTarKinds(t *testing.T) {
	data := tarOf(t, []*tar.Header{
		{Typeflag: tar.TypeXGlobalHeader, Name: "pax_global_header", PAXRecords: map[string]string{"comment": "x"}},
		{Name: "dir/", Typeflag: tar.TypeDir, Mode: 0o755},
		{Name: "dir/file", Typeflag: tar.TypeReg, Size: 3, Mode: 0o644},
		{Name: "dir/file", Typeflag: tar.TypeReg, Size: 3, Mode: 0o644},
		{Name: "dir/link", Typeflag: tar.TypeSymlink, Linkname: "/etc/passwd"},
	}, true)
	files, dir := tree(t, map[string]string{"v/pack.tgz": string(data)})
	result, err := extract(t, "pack.tgz", files)
	if err != nil {
		t.Fatal(err)
	}
	if result["files"] != int64(1) || result["skipped"] != int64(2) || result["folders"] != int64(1) {
		t.Fatalf("kinds: %v", result)
	}
	if read(t, dir, "v/pack/dir/file") != "xxx" {
		t.Fatal("content")
	}
}

func TestExtractTooLarge(t *testing.T) {
	zipped := zipOf(t, map[string]string{"big.txt": strings.Repeat("x", 100)})
	files, _ := tree(t, map[string]string{"v/big.zip": string(zipped)})
	_, err := extract(t, "big.zip", tight{files})
	var failure *jobs.Failure
	if !errors.As(err, &failure) || failure.Code != CodeTooLarge {
		t.Fatalf("declared size: %v", err)
	}
	tarred := tarOf(t, []*tar.Header{{Name: "big", Typeflag: tar.TypeReg, Size: 100, Mode: 0o644}}, false)
	files, _ = tree(t, map[string]string{"v/big.tar": string(tarred)})
	if _, err := extract(t, "big.tar", tight{files}); !errors.As(err, &failure) || failure.Code != CodeTooLarge {
		t.Fatalf("written size: %v", err)
	}
	if _, err := extract(t, "none.zip", files); !errors.Is(err, fsx.ErrNotFound) {
		t.Fatalf("missing archive: %v", err)
	}
}

func TestChecksum(t *testing.T) {
	files, _ := tree(t, map[string]string{"v/a.txt": "abc"})
	want := map[string]string{
		MD5:    "900150983cd24fb0d6963f7d28e17f72",
		SHA1:   "a9993e364706816aba3e25717850c26c9cd0d89d",
		SHA256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
		SHA512: "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f",
	}
	for algorithm, hash := range want {
		result, err := ChecksumHandler(files)(context.Background(), ChecksumArgs{Path: "/v/a.txt", Algorithm: algorithm}, reporter())
		if err != nil || result["hash"] != hash || result["bytes"] != int64(3) {
			t.Errorf("%s: %v %v", algorithm, result, err)
		}
	}
	if _, err := ChecksumHandler(files)(context.Background(), ChecksumArgs{Path: "/v/none"}, reporter()); err == nil {
		t.Fatal("missing file")
	}
	cancelled, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := ChecksumHandler(files)(cancelled, ChecksumArgs{Path: "/v/a.txt", Algorithm: SHA256}, reporter()); err == nil {
		t.Fatal("cancelled")
	}
}

func TestExtractZipKinds(t *testing.T) {
	var out bytes.Buffer
	writer := zip.NewWriter(&out)
	_, _ = writer.Create("folder/")
	link := &zip.FileHeader{Name: "folder/link"}
	link.SetMode(os.ModeSymlink | 0o777)
	w, _ := writer.CreateHeader(link)
	_, _ = w.Write([]byte("/etc/passwd"))
	f, _ := writer.Create("folder/file.txt")
	_, _ = f.Write([]byte("ok"))
	_ = writer.Close()
	files, dir := tree(t, map[string]string{"v/kinds.zip": out.String()})
	result, err := extract(t, "kinds.zip", files)
	if err != nil || result["files"] != int64(1) || result["skipped"] != int64(1) || result["folders"] != int64(1) {
		t.Fatalf("kinds: %v %v", result, err)
	}
	if read(t, dir, "v/kinds/folder/file.txt") != "ok" {
		t.Fatal("content")
	}
}

func TestCompressSkipsWhatCannotBeRead(t *testing.T) {
	files, _ := tree(t, map[string]string{"v/a.txt": "alpha", "v/b.txt": "beta"})
	bob := authz.Subject{UserID: "bob"}
	grants := fakeGrants{grants: []authz.Grant{
		{SubjectType: authz.SubjectUser, SubjectID: "bob", Path: "/v/a.txt", Actions: []string{"read"}, Effect: authz.EffectAllow},
	}}
	args := CompressArgs{Sources: []string{"/v/a.txt", "/v/b.txt"}, Folder: "/v", Format: TarGz, Subject: bob}
	result, err := CompressHandler(files, grants, nil)(context.Background(), args, reporter())
	if err != nil || result["items"] != int64(1) || result["skipped"] != int64(1) {
		t.Fatalf("skipped: %v %v", result, err)
	}
}
