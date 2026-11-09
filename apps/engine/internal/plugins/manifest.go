// Package plugins installs third-party tools that add catalog commands. The web app downloads a
// release from an allowlisted GitHub repository (the engine has no internet access) and hands
// the manifest, the binary and the checksum file to the engine, which checks everything before
// activating anything. No install script ever runs.
package plugins

import (
	"bytes"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"fmt"
	"regexp"
	"strings"

	"go.yaml.in/yaml/v3"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/commands"
)

// Refusals of an install (codes translated by the web app).
var (
	ErrManifest = errors.New("invalid plugin manifest")
	ErrChecksum = errors.New("checksum mismatch")
	ErrPlatform = errors.New("no binary for this platform")
)

// Error codes.
const (
	CodeManifest = "plugins.invalid_manifest"
	CodeChecksum = "plugins.checksum_mismatch"
	CodePlatform = "plugins.unsupported_platform"
	CodeNotFound = "plugins.not_found"
)

// Source says where releases come from.
type Source struct {
	// Repo is the GitHub "owner/name" releases are downloaded from.
	Repo string `yaml:"repo"`
	// Assets names the binary per platform ("linux-amd64": "tool-linux-amd64").
	Assets map[string]string `yaml:"assets"`
	// Checksums names the release asset listing SHA-256 sums (sha256sum format). Mandatory.
	Checksums string `yaml:"checksums"`
}

// Manifest is a release's canopy-plugin.yaml.
type Manifest struct {
	ID          string           `yaml:"id"`
	Name        commands.Text    `yaml:"name"`
	Description commands.Text    `yaml:"description"`
	Version     string           `yaml:"version"`
	Binary      string           `yaml:"binary"`
	MinCanopy   string           `yaml:"minCanopy,omitempty"`
	Source      Source           `yaml:"source"`
	Commands    []commands.Entry `yaml:"commands"`
}

var (
	pluginID     = regexp.MustCompile(`^[a-z][a-z0-9-]{1,31}$`)
	version      = regexp.MustCompile(`^v?\d+\.\d+\.\d+([-+][0-9A-Za-z.-]+)?$`)
	repoPattern  = regexp.MustCompile(`^[A-Za-z0-9-]{1,39}/[A-Za-z0-9._-]{1,100}$`)
	assetPattern = regexp.MustCompile(`^[A-Za-z0-9._-]{1,128}$`)
	platforms    = map[string]bool{"linux-amd64": true, "linux-arm64": true}
)

// ParseManifest reads and checks a manifest: strict fields, safe names, a mandatory checksum
// file, and commands that follow the catalog rules, all named after the plugin and using its own
// binary only.
func ParseManifest(data []byte) (Manifest, error) {
	decoder := yaml.NewDecoder(bytes.NewReader(data))
	decoder.KnownFields(true)
	var manifest Manifest
	if err := decoder.Decode(&manifest); err != nil {
		return Manifest{}, fmt.Errorf("%w: %w", ErrManifest, err)
	}
	if err := manifest.validate(); err != nil {
		return Manifest{}, fmt.Errorf("%w: %w", ErrManifest, err)
	}
	return manifest, nil
}

func (m *Manifest) validate() error {
	switch {
	case !pluginID.MatchString(m.ID):
		return errors.New("id must be lowercase letters, digits and dashes")
	case !version.MatchString(m.Version):
		return errors.New("version must look like 1.2.3")
	case !assetPattern.MatchString(m.Binary) || strings.HasPrefix(m.Binary, "."):
		return errors.New("binary must be a plain file name")
	case m.Name.En == "" || m.Name.Fr == "" || m.Name.Es == "":
		return errors.New("name needs en, fr and es")
	case !repoPattern.MatchString(m.Source.Repo):
		return errors.New("source.repo must be owner/name")
	case !assetPattern.MatchString(m.Source.Checksums):
		return errors.New("source.checksums is mandatory")
	case len(m.Source.Assets) == 0:
		return errors.New("source.assets is empty")
	case len(m.Commands) == 0:
		return errors.New("a plugin brings at least one command")
	}
	for platform, asset := range m.Source.Assets {
		if !platforms[platform] || !assetPattern.MatchString(asset) {
			return fmt.Errorf("asset %q for %q", asset, platform)
		}
	}
	for _, entry := range m.Commands {
		if entry.Binary != m.Binary || !strings.HasPrefix(entry.ID, m.ID+".") {
			return fmt.Errorf("command %q must use %q and be named %s.*", entry.ID, m.Binary, m.ID)
		}
	}
	if err := commands.Validate(m.Commands); err != nil {
		return err //nolint:wrapcheck // already says which entry
	}
	return nil
}

// Asset is the binary asset name for a platform ("linux-amd64").
func (m Manifest) Asset(platform string) (string, error) {
	asset, ok := m.Source.Assets[platform]
	if !ok {
		return "", ErrPlatform
	}
	return asset, nil
}

// ExpectedSum finds an asset's SHA-256 in a checksum file ("<hex>  <name>" or "<hex> *<name>").
func ExpectedSum(checksums []byte, asset string) (string, error) {
	for _, line := range strings.Split(string(checksums), "\n") {
		fields := strings.Fields(line)
		if len(fields) != 2 || strings.TrimPrefix(fields[1], "*") != asset {
			continue
		}
		sum := strings.ToLower(fields[0])
		if decoded, err := hex.DecodeString(sum); err != nil || len(decoded) != sha256.Size {
			return "", fmt.Errorf("%w: malformed sum for %s", ErrChecksum, asset)
		}
		return sum, nil
	}
	return "", fmt.Errorf("%w: %s is not listed", ErrChecksum, asset)
}

// SameSum compares a computed sum with the expected one in constant time.
func SameSum(computed []byte, expected string) bool {
	want, err := hex.DecodeString(expected)
	return err == nil && subtle.ConstantTimeCompare(computed, want) == 1
}
