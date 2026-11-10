package commands

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// TestSevenZipCatalog runs every built-in 7-Zip entry for real, with each option set, so a
// switch 7-Zip refuses fails here rather than for a person. Skipped where 7zz is not installed.
func TestSevenZipCatalog(t *testing.T) {
	binary, err := exec.LookPath("7zz")
	if err != nil {
		t.Skip("7zz not installed")
	}
	builtin, err := Builtin()
	if err != nil {
		t.Fatal(err)
	}
	entries := map[string]Entry{}
	for _, entry := range builtin {
		entries[entry.ID] = entry
	}
	root := t.TempDir()
	for name, content := range map[string]string{"docs/a.txt": "alpha", "docs/sub/b.txt": strings.Repeat("beta", 1000)} {
		full := filepath.Join(root, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(full, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	run := func(id string, values map[string]any) string {
		t.Helper()
		plan, err := Build(entries[id], values, resolver(root), false)
		if err != nil {
			t.Fatalf("%s: %v", id, err)
		}
		output, err := exec.Command(binary, plan.Argv...).CombinedOutput() //nolint:gosec // test
		if err != nil {
			t.Fatalf("%s %v: %v\n%s", id, plan.Preview, err, output)
		}
		return string(output)
	}
	run("sevenzip.create", map[string]any{
		"source": "/docs", "destination": "/", "archiveName": "all", "level": "9", "method": "PPMd",
		"solid": "off", "password": "s3cret", "encryptNames": true,
	})
	run("sevenzip.create", map[string]any{"source": "/docs", "destination": "/", "archiveName": "parts", "volumeSize": "1k", "level": "0"})
	run("sevenzip.zip", map[string]any{
		"source": "/docs", "destination": "/", "archiveName": "all", "method": "Deflate64", "password": "s3cret", "encryption": "ZipCrypto",
	})
	run("sevenzip.zip", map[string]any{"source": "/docs", "destination": "/", "archiveName": "plain"})
	if out := run("sevenzip.test", map[string]any{"archive": "/all.7z", "password": "s3cret"}); !strings.Contains(out, "Everything is Ok") {
		t.Fatalf("test: %s", out)
	}
	if out := run("sevenzip.list", map[string]any{"archive": "/plain.zip"}); !strings.Contains(out, "docs/sub/b.txt") {
		t.Fatalf("list: %s", out)
	}
	for _, existing := range []string{"s", "a", "u", "t"} {
		run("sevenzip.extract", map[string]any{"archive": "/all.zip", "destination": "/out", "existing": existing, "password": "s3cret"})
	}
	run("sevenzip.extract", map[string]any{"archive": "/parts.7z.001", "destination": "/joined"})
	if data, err := os.ReadFile(filepath.Join(root, "joined", "docs", "a.txt")); err != nil || string(data) != "alpha" {
		t.Fatalf("split archive: %q %v", data, err)
	}
}
