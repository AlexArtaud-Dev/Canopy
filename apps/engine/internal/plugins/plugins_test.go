package plugins

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/commands"
)

func manifestFor(version string) string {
	return `id: mrename
name: { en: Rename episodes, fr: Renommer, es: Renombrar }
description: { en: x, fr: x, es: x }
version: ` + version + `
binary: mrename
source:
  repo: AlexArtaud-Dev/mrename
  checksums: SHA256SUMS
  assets: { linux-amd64: mrename-linux-amd64, linux-arm64: mrename-linux-arm64 }
commands:
  - id: mrename.rename
    name: { en: Rename, fr: Renommer, es: Renombrar }
    description: { en: x, fr: x, es: x }
    binary: mrename
    mode: advanced
    params:
      - { name: folder, type: path, access: update, required: true, label: { en: F, fr: D, es: C } }
    args: ["{folder}"]
    progressParser: line-count
    timeout: 1h
`
}

type memoryStore struct {
	records map[string]Record
	err     error
}

func (m *memoryStore) All(context.Context) ([]Record, error) {
	if m.err != nil {
		return nil, m.err
	}
	var all []Record
	for _, record := range m.records {
		all = append(all, record)
	}
	return all, nil
}

func (m *memoryStore) Save(_ context.Context, record Record) error {
	m.records[record.ID] = record
	return nil
}

func (m *memoryStore) SetFlags(_ context.Context, id string, enabled, pinned bool) error {
	record := m.records[id]
	record.Enabled, record.Pinned = enabled, pinned
	m.records[id] = record
	return nil
}

func (m *memoryStore) Delete(_ context.Context, id string) error {
	delete(m.records, id)
	return nil
}

type catalogSpy struct{ located []commands.Located }

func (c *catalogSpy) SetPlugins(located []commands.Located) { c.located = located }

func sumsFor(asset string, content []byte) []byte {
	sum := sha256.Sum256(content)
	return []byte("# release\n" + hex.EncodeToString(sum[:]) + "  " + asset + "\n")
}

func TestManifest(t *testing.T) {
	manifest, err := ParseManifest([]byte(manifestFor("1.0.0")))
	if err != nil {
		t.Fatal(err)
	}
	if asset, err := manifest.Asset("linux-arm64"); err != nil || asset != "mrename-linux-arm64" {
		t.Fatalf("asset: %q %v", asset, err)
	}
	if _, err := manifest.Asset("windows-amd64"); !errors.Is(err, ErrPlatform) {
		t.Fatal("unknown platform")
	}
	bad := map[string]string{
		"id":        "id: MRename",
		"version":   "version: one",
		"binary":    "binary: ../mrename",
		"repo":      "repo: not a repo",
		"checksums": "checksums: SHA256SUMS",
		"platform":  "assets: { windows-amd64: x }",
		"field":     "binary: mrename\nhack: true",
	}
	replace := map[string]string{
		"id": "id: mrename", "version": "version: 1.0.0", "binary": "binary: mrename",
		"repo": "repo: AlexArtaud-Dev/mrename", "checksums": "checksums: SHA256SUMS",
		"platform": "assets: { linux-amd64: mrename-linux-amd64, linux-arm64: mrename-linux-arm64 }",
		"field":    "binary: mrename",
	}
	for name, broken := range bad {
		data := strings.Replace(manifestFor("1.0.0"), replace[name], broken, 1)
		if name == "checksums" {
			data = strings.Replace(manifestFor("1.0.0"), "  checksums: SHA256SUMS\n", "", 1)
		}
		if _, err := ParseManifest([]byte(data)); !errors.Is(err, ErrManifest) {
			t.Errorf("%s accepted", name)
		}
	}
	foreign := strings.Replace(manifestFor("1.0.0"), "id: mrename.rename", "id: rsync.sync", 1)
	if _, err := ParseManifest([]byte(foreign)); !errors.Is(err, ErrManifest) {
		t.Fatal("commands must be named after the plugin")
	}
	otherBinary := strings.Replace(manifestFor("1.0.0"), "    binary: mrename\n", "    binary: rm\n", 1)
	if _, err := ParseManifest([]byte(otherBinary)); !errors.Is(err, ErrManifest) {
		t.Fatal("commands must use the plugin binary")
	}
	brokenCommand := strings.Replace(manifestFor("1.0.0"), "timeout: 1h", "timeout: 0s", 1)
	if _, err := ParseManifest([]byte(brokenCommand)); !errors.Is(err, ErrManifest) {
		t.Fatal("commands follow the catalog rules")
	}
	head, _, _ := strings.Cut(manifestFor("1.0.0"), "commands:")
	noCommands := head + "commands: []\n"
	if _, err := ParseManifest([]byte(noCommands)); !errors.Is(err, ErrManifest) {
		t.Fatal("no commands")
	}
	for _, field := range []string{"name: { en: Rename episodes, fr: Renommer, es: Renombrar }", "    linux-arm64: x"} {
		data := strings.Replace(manifestFor("1.0.0"), field, "name: { en: A }", 1)
		if field != "    linux-arm64: x" {
			if _, err := ParseManifest([]byte(data)); !errors.Is(err, ErrManifest) {
				t.Fatal("name languages")
			}
		}
	}
	empty := strings.Replace(manifestFor("1.0.0"), "assets: { linux-amd64: mrename-linux-amd64, linux-arm64: mrename-linux-arm64 }", "assets: {}", 1)
	if _, err := ParseManifest([]byte(empty)); !errors.Is(err, ErrManifest) {
		t.Fatal("no assets")
	}
}

func TestChecksums(t *testing.T) {
	sums := sumsFor("tool", []byte("binary"))
	sum, err := ExpectedSum(sums, "tool")
	if err != nil || len(sum) != 64 {
		t.Fatalf("sum: %q %v", sum, err)
	}
	if _, err := ExpectedSum([]byte(sum+" *tool\n"), "tool"); err != nil {
		t.Fatal("binary marker")
	}
	if _, err := ExpectedSum(sums, "other"); !errors.Is(err, ErrChecksum) {
		t.Fatal("not listed")
	}
	if _, err := ExpectedSum([]byte("abcd  tool\n"), "tool"); !errors.Is(err, ErrChecksum) {
		t.Fatal("malformed")
	}
	computed := sha256.Sum256([]byte("binary"))
	if !SameSum(computed[:], sum) || SameSum(computed[:], "zz") {
		t.Fatal("compare")
	}
}

func newService(t *testing.T) (*Service, *memoryStore, *catalogSpy) {
	t.Helper()
	store := &memoryStore{records: map[string]Record{}}
	catalog := &catalogSpy{}
	return &Service{
		Dir: t.TempDir(), Store: store, Catalog: catalog,
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)), Now: time.Now, OnPlatform: "linux-amd64",
	}, store, catalog
}

func TestInstallLifecycle(t *testing.T) {
	service, store, catalog := newService(t)
	ctx := context.Background()
	asset, err := ParseManifest([]byte(manifestFor("1.0.0")))
	if err != nil {
		t.Fatal(err)
	}
	name, err := asset.Asset(service.platform())
	if err != nil {
		t.Fatal(err)
	}
	if Platform() == "" || (&Service{}).platform() != Platform() {
		t.Fatal("host platform by default")
	}
	release, err := service.Inspect([]byte(manifestFor("1.0.0")))
	if err != nil || release.BinaryAsset != "mrename-linux-amd64" || release.ChecksumsAsset != "SHA256SUMS" {
		t.Fatalf("inspect: %+v %v", release, err)
	}
	binary := []byte("#!/bin/true\n")
	install := func(version string, content []byte, sums []byte) error {
		_, err := service.Install(ctx, []byte(manifestFor(version)), sums, bytes.NewReader(content), "root")
		return err
	}
	if err := install("1.0.0", []byte("tampered"), sumsFor(name, binary)); !errors.Is(err, ErrChecksum) {
		t.Fatalf("checksum: %v", err)
	}
	if _, err := os.Stat(filepath.Join(service.Dir, "mrename", "1.0.0")); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("nothing kept after a failed install")
	}
	if err := install("1.0.0", binary, sumsFor(name, binary)); err != nil {
		t.Fatal(err)
	}
	if len(catalog.located) != 1 || !strings.HasSuffix(catalog.located[0].Binary, filepath.Join("1.0.0", "mrename")) {
		t.Fatalf("catalog: %+v", catalog.located)
	}
	if err := service.SetFlags(ctx, "mrename", true, true); err != nil {
		t.Fatal(err)
	}
	if err := install("1.1.0", binary, sumsFor(name, binary)); err != nil {
		t.Fatal(err)
	}
	if record := store.records["mrename"]; record.Version != "1.1.0" || !record.Pinned {
		t.Fatalf("update keeps the pin: %+v", record)
	}
	if _, err := os.Stat(filepath.Join(service.Dir, "mrename", "1.0.0")); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("old version removed")
	}
	listed, err := service.List(ctx)
	if err != nil || len(listed) != 1 || listed[0].Commands != 1 || listed[0].Name.En != "Rename episodes" {
		t.Fatalf("list: %+v %v", listed, err)
	}
	if err := service.SetFlags(ctx, "mrename", false, true); err != nil || len(catalog.located) != 0 {
		t.Fatalf("disabled: %v %+v", err, catalog.located)
	}
	if err := service.Uninstall(ctx, "mrename"); err != nil || len(store.records) != 0 {
		t.Fatalf("uninstall: %v", err)
	}
	for _, err := range []error{service.Uninstall(ctx, "mrename"), service.SetFlags(ctx, "mrename", true, false)} {
		if !errors.Is(err, ErrNotFound) {
			t.Fatalf("not installed: %v", err)
		}
	}
	tooBig := io.LimitReader(zeros{}, MaxBinaryBytes+10)
	if _, err := service.Install(ctx, []byte(manifestFor("2.0.0")), sumsFor(name, binary), tooBig, "root"); !errors.Is(err, ErrChecksum) {
		t.Fatalf("too big: %v", err)
	}
	if err := install("2.0.0", binary, []byte("nothing")); !errors.Is(err, ErrChecksum) {
		t.Fatalf("unlisted: %v", err)
	}
	if _, err := service.Install(ctx, []byte("id: x"), nil, nil, "root"); !errors.Is(err, ErrManifest) {
		t.Fatalf("manifest: %v", err)
	}
	service.OnPlatform = "linux-riscv64"
	if err := install("2.0.0", binary, sumsFor(name, binary)); !errors.Is(err, ErrPlatform) {
		t.Fatalf("platform: %v", err)
	}
}

func TestRefreshSkipsBrokenPlugins(t *testing.T) {
	service, store, catalog := newService(t)
	ctx := context.Background()
	store.records["broken"] = Record{ID: "broken", Version: "1.0.0", Manifest: []byte("nope"), Enabled: true}
	store.records["mrename"] = Record{ID: "mrename", Version: "1.0.0", Manifest: []byte(manifestFor("1.0.0")), Enabled: true}
	if err := service.Refresh(ctx); err != nil || len(catalog.located) != 0 {
		t.Fatalf("missing binary and bad manifest skipped: %v %+v", err, catalog.located)
	}
	listed, err := service.List(ctx)
	if err != nil || len(listed) != 2 {
		t.Fatalf("still listed: %v %+v", err, listed)
	}
	store.err = errors.New("db")
	if err := service.Refresh(ctx); err == nil {
		t.Fatal("store failure")
	}
	if _, err := service.List(ctx); err == nil {
		t.Fatal("store failure")
	}
}

type zeros struct{}

func (zeros) Read(buffer []byte) (int, error) {
	clear(buffer)
	return len(buffer), nil
}
