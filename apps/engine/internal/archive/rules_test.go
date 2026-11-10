package archive

import (
	"errors"
	"testing"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/fsx"
)

func TestFormats(t *testing.T) {
	cases := map[string]Format{"a.ZIP": Zip, "a.tar.gz": TarGz, "a.tgz": TarGz, "a.tar": Tar, "a.7z": SevenZ, "a.RAR": Rar, "disc.iso": Iso, "a.cab": None}
	for name, want := range cases {
		if got := FormatOf(name); got != want {
			t.Errorf("FormatOf(%q) = %q", name, got)
		}
	}
	if !ValidOutput(Zip) || !ValidOutput(TarGz) || !ValidOutput(SevenZ) || ValidOutput(Tar) || ValidOutput(Rar) || ValidOutput(None) {
		t.Fatal("outputs")
	}
	stems := map[string]string{"photos.tar.gz": "photos", "x.TGZ": "x", "a.zip": "a", "b.tar": "b", "c.7z": "c", "d.rar": "d", ".zip": ".zip", "notes": "notes"}
	for name, want := range stems {
		if got := Stem(name); got != want {
			t.Errorf("Stem(%q) = %q", name, got)
		}
	}
	for _, algorithm := range []string{MD5, SHA1, SHA256, SHA512} {
		if !ValidAlgorithm(algorithm) {
			t.Errorf("%s", algorithm)
		}
	}
	if ValidAlgorithm("crc32") {
		t.Fatal("unknown algorithm")
	}
}

func TestParentAndNames(t *testing.T) {
	if parent, err := Parent([]string{"/v/a", "/v/b"}); err != nil || parent != "/v" {
		t.Fatalf("parent: %q %v", parent, err)
	}
	if _, err := Parent([]string{"/v/a", "/w/b"}); !errors.Is(err, ErrMixedFolders) {
		t.Fatal("mixed")
	}
	if _, err := Parent(nil); !errors.Is(err, fsx.ErrInvalidPath) {
		t.Fatal("empty")
	}
	if BaseName([]string{"/v/a.txt"}) != "a.txt" || BaseName([]string{"/v/a", "/v/b"}) != "v" || BaseName([]string{"/a", "/b"}) != "archive" {
		t.Fatal("base names")
	}
	used := map[string]bool{"a.zip": true, "a (2).zip": true}
	if got := FreeName("a", ".zip", func(name string) bool { return used[name] }); got != "a (3).zip" {
		t.Fatalf("free name: %q", got)
	}
}

func TestEntryTarget(t *testing.T) {
	good := map[string]string{
		"a.txt": "/d/a.txt", "dir/": "/d/dir", "dir\\b.txt": "/d/dir/b.txt", "./c/./d.txt": "/d/c/d.txt",
	}
	for name, want := range good {
		if got, err := EntryTarget("/d", name); err != nil || got != want {
			t.Errorf("EntryTarget(%q) = %q, %v", name, got, err)
		}
	}
	for _, name := range []string{"", "/abs", "../up", "a/../../up", "a\x00b", ".canopy-uploads/x", "./", "a/../b"} {
		if _, err := EntryTarget("/d", name); !errors.Is(err, ErrBadArchive) {
			t.Errorf("EntryTarget(%q) accepted", name)
		}
	}
}

func TestJobIdentity(t *testing.T) {
	if (CompressArgs{Job: "a"}).JobID() != "a" || (CompressArgs{}).Kind() != CompressKind ||
		(ExtractArgs{Job: "b"}).JobID() != "b" || (ExtractArgs{}).Kind() != ExtractKind ||
		(ChecksumArgs{Job: "c"}).JobID() != "c" || (ChecksumArgs{}).Kind() != ChecksumKind {
		t.Fatal("job identity")
	}
	if coded(errors.New("other")).Error() != "other" {
		t.Fatal("other errors keep theirs")
	}
}
