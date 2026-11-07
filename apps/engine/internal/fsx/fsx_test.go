package fsx

import (
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"slices"
	"strings"
	"testing"
)

func TestClean(t *testing.T) {
	valid := map[string]string{
		"/":                 "/",
		"/photos/":          "/photos",
		"/a/./b//c":         "/a/b/c",
		"/a/../../etc":      "/etc",
		"/../..":            "/",
		"/vacances été.jpg": "/vacances été.jpg",
	}
	for input, want := range valid {
		got, err := Clean(input)
		if err != nil || got != want {
			t.Errorf("Clean(%q) = %q, %v; want %q", input, got, err, want)
		}
	}
	invalid := []string{"", "photos", "/a\x00b", "/\xff", "/" + strings.Repeat("a", maxPathBytes)}
	for _, input := range invalid {
		if _, err := Clean(input); !errors.Is(err, ErrInvalidPath) {
			t.Errorf("Clean(%q) accepted", input)
		}
	}
}

func TestPathHelpers(t *testing.T) {
	if Relative("/") != "." || Relative("/a/b") != "a/b" {
		t.Fatal("Relative")
	}
	within := [][2]string{{"/a/b", "/a"}, {"/a", "/a"}, {"/x", "/"}}
	for _, pair := range within {
		if !IsWithin(pair[0], pair[1]) {
			t.Errorf("IsWithin(%q, %q) = false", pair[0], pair[1])
		}
	}
	if IsWithin("/ab", "/a") || IsWithin("/a", "/a/b") {
		t.Fatal("IsWithin matched a sibling or a child")
	}
	if got := Ancestors("/a/b"); !slices.Equal(got, []string{"/", "/a", "/a/b"}) {
		t.Fatalf("Ancestors = %v", got)
	}
	if got := Ancestors("/"); !slices.Equal(got, []string{"/"}) {
		t.Fatalf("Ancestors(/) = %v", got)
	}
}

func newTree(t *testing.T) (*Resolver, string) {
	t.Helper()
	base := t.TempDir()
	root := filepath.Join(base, "root")
	must(t, os.MkdirAll(filepath.Join(root, "photos", "2024"), 0o755))
	must(t, os.WriteFile(filepath.Join(root, "photos", "cat.jpg"), []byte("meow"), 0o644))
	must(t, os.WriteFile(filepath.Join(base, "secret.txt"), []byte("outside"), 0o644))
	resolver, err := OpenResolver(root)
	must(t, err)
	t.Cleanup(func() { _ = resolver.Close() })
	return resolver, base
}

func must(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}

func TestResolver(t *testing.T) {
	resolver, _ := newTree(t)

	entries, err := resolver.ReadDir("/photos")
	must(t, err)
	names := map[string]Entry{}
	for _, entry := range entries {
		names[entry.Name] = entry
	}
	if !names["2024"].IsDir || names["cat.jpg"].Size != 4 || names["2024"].Size != 0 {
		t.Fatalf("unexpected listing %+v", entries)
	}

	rootEntry, err := resolver.Stat("/")
	must(t, err)
	if !rootEntry.IsDir || rootEntry.Name != "/" {
		t.Fatalf("root stat %+v", rootEntry)
	}
	file, err := resolver.Stat("/photos/cat.jpg")
	must(t, err)
	if file.Name != "cat.jpg" || file.IsDir {
		t.Fatalf("file stat %+v", file)
	}

	if _, err := resolver.ReadDir("/photos/cat.jpg"); !errors.Is(err, ErrNotDir) {
		t.Fatalf("ReadDir on a file: %v", err)
	}
	if _, err := resolver.ReadDir("/missing"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing dir: %v", err)
	}
	if _, err := resolver.Stat("/missing"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing stat: %v", err)
	}
	if _, err := resolver.Stat("relative"); !errors.Is(err, ErrInvalidPath) {
		t.Fatalf("relative stat: %v", err)
	}
	if _, err := resolver.ReadDir("relative"); !errors.Is(err, ErrInvalidPath) {
		t.Fatalf("relative list: %v", err)
	}
	// ".." is resolved lexically: it can never reach the parent of the root.
	if _, err := resolver.Stat("/../secret.txt"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("escaped with ..: %v", err)
	}
}

func TestResolverRefusesSymlinkEscape(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlinks need privileges on Windows; CI runs on Linux")
	}
	resolver, base := newTree(t)
	must(t, os.Symlink(base, filepath.Join(base, "root", "escape")))
	if _, err := resolver.Stat("/escape/secret.txt"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("symlink escaped the root: %v", err)
	}
	if _, err := resolver.ReadDir("/escape"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("symlink dir escaped the root: %v", err)
	}
}

func TestOpenResolverMissing(t *testing.T) {
	if _, err := OpenResolver(filepath.Join(t.TempDir(), "nope")); err == nil {
		t.Fatal("opened a missing root")
	}
}
