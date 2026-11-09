package plugins

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"runtime"
	"time"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/commands"
)

// MaxBinaryBytes bounds a plugin binary.
const MaxBinaryBytes = 256 << 20

// ErrNotFound means no such plugin is installed.
var ErrNotFound = errors.New("plugin not installed")

// Platform is this engine's platform, as manifests name it.
func Platform() string { return runtime.GOOS + "-" + runtime.GOARCH }

// Record is an installed plugin as stored.
type Record struct {
	ID          string
	Version     string
	Repo        string
	Manifest    []byte
	Enabled     bool
	Pinned      bool
	InstalledAt time.Time
	InstalledBy string
}

// Store keeps installed plugins (engine.plugins).
type Store interface {
	All(ctx context.Context) ([]Record, error)
	Save(ctx context.Context, record Record) error
	SetFlags(ctx context.Context, id string, enabled, pinned bool) error
	Delete(ctx context.Context, id string) error
}

// Catalog receives the plugins' commands.
type Catalog interface {
	SetPlugins(located []commands.Located)
}

// Service installs and manages plugins in Dir (<id>/<version>/<binary>).
type Service struct {
	Dir     string
	Store   Store
	Catalog Catalog
	Logger  *slog.Logger
	Now     func() time.Time
	// OnPlatform overrides the platform binaries are picked for (tests); empty means this host.
	OnPlatform string
}

func (s *Service) platform() string {
	if s.OnPlatform != "" {
		return s.OnPlatform
	}
	return Platform()
}

// Installed is what the admin page shows.
type Installed struct {
	Record
	Name        commands.Text
	Description commands.Text
	Commands    int
}

// List returns installed plugins with their manifest details.
func (s *Service) List(ctx context.Context) ([]Installed, error) {
	records, err := s.Store.All(ctx)
	if err != nil {
		return nil, fmt.Errorf("list plugins: %w", err)
	}
	installed := make([]Installed, 0, len(records))
	for _, record := range records {
		manifest, err := ParseManifest(record.Manifest)
		if err != nil {
			// Kept listed so it can be removed, even if a stricter engine refuses it now.
			installed = append(installed, Installed{Record: record})
			continue
		}
		installed = append(installed, Installed{
			Record: record, Name: manifest.Name, Description: manifest.Description, Commands: len(manifest.Commands),
		})
	}
	return installed, nil
}

// Install checks the manifest, the platform and the binary's SHA-256 against the checksum file,
// then stores the binary (executable) and activates the plugin. Nothing is kept on failure.
func (s *Service) Install(ctx context.Context, manifestData, checksums []byte, binary io.Reader, by string) (Manifest, error) {
	manifest, err := ParseManifest(manifestData)
	if err != nil {
		return Manifest{}, err
	}
	asset, err := manifest.Asset(s.platform())
	if err != nil {
		return Manifest{}, err
	}
	expected, err := ExpectedSum(checksums, asset)
	if err != nil {
		return Manifest{}, err
	}
	folder := filepath.Join(s.Dir, manifest.ID, manifest.Version)
	if err := os.MkdirAll(folder, 0o750); err != nil {
		return Manifest{}, fmt.Errorf("create plugin folder: %w", err)
	}
	if err := writeVerified(filepath.Join(folder, manifest.Binary), binary, expected); err != nil {
		_ = os.RemoveAll(folder)
		return Manifest{}, err
	}
	previous := s.recordOf(ctx, manifest.ID)
	record := Record{
		ID: manifest.ID, Version: manifest.Version, Repo: manifest.Source.Repo, Manifest: manifestData,
		Enabled: true, Pinned: previous != nil && previous.Pinned, InstalledAt: s.Now(), InstalledBy: by,
	}
	if err := s.Store.Save(ctx, record); err != nil {
		_ = os.RemoveAll(folder)
		return Manifest{}, fmt.Errorf("record plugin: %w", err)
	}
	if previous != nil && previous.Version != manifest.Version {
		_ = os.RemoveAll(filepath.Join(s.Dir, manifest.ID, previous.Version))
	}
	return manifest, s.Refresh(ctx)
}

func writeVerified(target string, binary io.Reader, expected string) (err error) {
	// The path is built from a validated manifest (id, version, binary name) under the plugins folder.
	file, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o750) //nolint:gosec // see above
	if err != nil {
		return fmt.Errorf("write plugin binary: %w", err)
	}
	defer func() {
		if closeErr := file.Close(); err == nil && closeErr != nil {
			err = fmt.Errorf("close plugin binary: %w", closeErr)
		}
	}()
	hash := sha256.New()
	written, err := io.Copy(io.MultiWriter(file, hash), io.LimitReader(binary, MaxBinaryBytes+1))
	if err != nil {
		return fmt.Errorf("receive plugin binary: %w", err)
	}
	if written > MaxBinaryBytes {
		return fmt.Errorf("%w: binary larger than %d bytes", ErrChecksum, MaxBinaryBytes)
	}
	if !SameSum(hash.Sum(nil), expected) {
		return ErrChecksum
	}
	return nil
}

func (s *Service) recordOf(ctx context.Context, id string) *Record {
	records, err := s.Store.All(ctx)
	if err != nil {
		return nil
	}
	for i := range records {
		if records[i].ID == id {
			return &records[i]
		}
	}
	return nil
}

// SetFlags enables, disables, pins or unpins a plugin.
func (s *Service) SetFlags(ctx context.Context, id string, enabled, pinned bool) error {
	if s.recordOf(ctx, id) == nil {
		return ErrNotFound
	}
	if err := s.Store.SetFlags(ctx, id, enabled, pinned); err != nil {
		return fmt.Errorf("update plugin: %w", err)
	}
	return s.Refresh(ctx)
}

// Uninstall removes a plugin's commands, files and record.
func (s *Service) Uninstall(ctx context.Context, id string) error {
	if s.recordOf(ctx, id) == nil {
		return ErrNotFound
	}
	if err := s.Store.Delete(ctx, id); err != nil {
		return fmt.Errorf("delete plugin: %w", err)
	}
	if err := os.RemoveAll(filepath.Join(s.Dir, id)); err != nil {
		s.Logger.WarnContext(ctx, "plugin files left behind", slog.String("plugin", id), slog.Any("error", err))
	}
	return s.Refresh(ctx)
}

// Refresh gives the catalog the commands of every enabled plugin whose binary is in place.
func (s *Service) Refresh(ctx context.Context) error {
	records, err := s.Store.All(ctx)
	if err != nil {
		return fmt.Errorf("load plugins: %w", err)
	}
	var located []commands.Located
	for _, record := range records {
		if !record.Enabled {
			continue
		}
		manifest, err := ParseManifest(record.Manifest)
		if err != nil {
			s.Logger.WarnContext(ctx, "plugin manifest refused", slog.String("plugin", record.ID), slog.Any("error", err))
			continue
		}
		binary := filepath.Join(s.Dir, record.ID, record.Version, manifest.Binary)
		if _, err := os.Stat(binary); err != nil {
			s.Logger.WarnContext(ctx, "plugin binary missing", slog.String("plugin", record.ID))
			continue
		}
		for _, entry := range manifest.Commands {
			located = append(located, commands.Located{Entry: entry, Binary: binary})
		}
	}
	s.Catalog.SetPlugins(located)
	return nil
}
