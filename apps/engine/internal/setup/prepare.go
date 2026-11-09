// Package setup prepares a Canopy installation from a single folder (CANOPY_HOME): its
// sub-folders with the right owners, generated secrets, and the database roles and schemas.
// It runs as one-shot containers before the apps start, and is safe to run on every start:
// what exists is kept, what is missing is created, owners are set again.
package setup

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

// Folders inside CANOPY_HOME.
const (
	PostgresDir = "postgres"
	SecretsDir  = "secrets"
	CacheDir    = "cache"
	PluginsDir  = "plugins"
)

// Secret file names inside SecretsDir (names, not values).
//
//nolint:gosec // file names only: G101 matches "password" in them
const (
	DBAdminPassword   = "db-admin-password"
	WebDBPassword     = "web-db-password"
	EngineDBPassword  = "engine-db-password"
	EncryptionKey     = "encryption-key"
	EnginePrivateKey  = "engine-private-key"
	EnginePublicKey   = "engine-public-key"
	WebDatabaseURL    = "web-database-url"
	EngineDatabaseURL = "engine-database-url"
)

// Options says where to prepare and who reads what.
type Options struct {
	Home string
	// PUID/PGID run the engine and own the files it creates (cache, plugins).
	PUID, PGID int
	// WebUID runs the web app (the `node` user of its image).
	WebUID int
	// PostgresUID runs Postgres (70 in the alpine image).
	PostgresUID int
	// DBHost is the database's host name on the internal network.
	DBHost string
	// Chown is os.Lchown in production; tests pass a recorder (no root needed).
	Chown  func(path string, uid, gid int) error
	Random io.Reader
}

// Report lists what this run created, for the log.
type Report struct {
	CreatedFolders []string
	CreatedSecrets []string
}

type folder struct {
	name     string
	mode     fs.FileMode
	uid, gid int
	chown    bool
}

type secret struct {
	name  string
	owner int
	mode  fs.FileMode
}

// Prepare creates the folders and the missing secrets, then sets owners and modes.
func Prepare(opts Options) (Report, error) {
	var report Report
	folders := []folder{
		// Postgres 18 creates its data under postgres/18/ as its own user: the folder must be its.
		{name: PostgresDir, mode: 0o700, uid: opts.PostgresUID, gid: opts.PostgresUID, chown: true},
		{name: SecretsDir, mode: 0o755, chown: true},
		{name: CacheDir, mode: 0o750, uid: opts.PUID, gid: opts.PGID, chown: true},
		{name: PluginsDir, mode: 0o750, uid: opts.PUID, gid: opts.PGID, chown: true},
	}
	for _, f := range folders {
		path := filepath.Join(opts.Home, f.name)
		created, err := ensureDir(path, f.mode)
		if err != nil {
			return report, err
		}
		if created {
			report.CreatedFolders = append(report.CreatedFolders, f.name)
		}
		if f.chown {
			if err := own(opts, path, f.uid, f.gid, f.mode); err != nil {
				return report, err
			}
		}
	}
	created, err := ensureSecrets(opts)
	report.CreatedSecrets = created
	return report, err
}

func ensureDir(path string, mode fs.FileMode) (bool, error) {
	if info, err := os.Stat(path); err == nil {
		if !info.IsDir() {
			return false, fmt.Errorf("%s exists and is not a folder", path)
		}
		return false, nil
	}
	if err := os.MkdirAll(path, mode); err != nil {
		return false, fmt.Errorf("create %s: %w", path, err)
	}
	return true, nil
}

func own(opts Options, path string, uid, gid int, mode fs.FileMode) error {
	if err := opts.Chown(path, uid, gid); err != nil {
		return fmt.Errorf("set the owner of %s: %w", path, err)
	}
	if err := os.Chmod(path, mode); err != nil {
		return fmt.Errorf("set the mode of %s: %w", path, err)
	}
	return nil
}

// ensureSecrets writes each missing secret once, then gives every file to the one service that
// reads it (mode 0400), so no app can read another's credentials.
func ensureSecrets(opts Options) ([]string, error) {
	dir := filepath.Join(opts.Home, SecretsDir)
	var created []string
	generate := func(name string, newValue func() (string, error)) (string, error) {
		path := filepath.Join(dir, name)
		if data, err := os.ReadFile(path); err == nil { //nolint:gosec // inside CANOPY_HOME
			return strings.TrimSpace(string(data)), nil
		} else if !errors.Is(err, fs.ErrNotExist) {
			return "", fmt.Errorf("read %s: %w", name, err)
		}
		value, err := newValue()
		if err != nil {
			return "", err
		}
		if err := os.WriteFile(path, []byte(value+"\n"), 0o400); err != nil {
			return "", fmt.Errorf("write %s: %w", name, err)
		}
		created = append(created, name)
		return value, nil
	}

	password := func() (string, error) { return randomHex(opts.Random, 24) }
	values := map[string]string{}
	for _, name := range []string{DBAdminPassword, WebDBPassword, EngineDBPassword} {
		value, err := generate(name, password)
		if err != nil {
			return created, err
		}
		values[name] = value
	}
	if _, err := generate(EncryptionKey, func() (string, error) { return randomBase64(opts.Random, 32) }); err != nil {
		return created, err
	}
	private, err := generate(EnginePrivateKey, func() (string, error) {
		seed := make([]byte, ed25519.SeedSize)
		if _, err := io.ReadFull(opts.Random, seed); err != nil {
			return "", fmt.Errorf("generate the engine key: %w", err)
		}
		return base64.RawURLEncoding.EncodeToString(seed), nil
	})
	if err != nil {
		return created, err
	}
	public, err := publicKeyOf(private)
	if err != nil {
		return created, err
	}
	// Derived values are rewritten on every run so they always match their source.
	derived := map[string]string{
		EnginePublicKey:   public,
		WebDatabaseURL:    DatabaseURL("canopy_web", values[WebDBPassword], opts.DBHost),
		EngineDatabaseURL: DatabaseURL("canopy_engine", values[EngineDBPassword], opts.DBHost),
	}
	for name, value := range derived {
		path := filepath.Join(dir, name)
		_ = os.Chmod(path, 0o600) // a previous run left it read-only
		if err := os.WriteFile(path, []byte(value+"\n"), 0o600); err != nil {
			return created, fmt.Errorf("write %s: %w", name, err)
		}
	}

	owners := []secret{
		{name: DBAdminPassword, owner: opts.PostgresUID, mode: 0o400},
		{name: WebDBPassword, owner: 0, mode: 0o400},
		{name: EngineDBPassword, owner: 0, mode: 0o400},
		{name: EncryptionKey, owner: opts.WebUID, mode: 0o400},
		{name: EnginePrivateKey, owner: opts.WebUID, mode: 0o400},
		{name: EnginePublicKey, owner: opts.PUID, mode: 0o444},
		{name: WebDatabaseURL, owner: opts.WebUID, mode: 0o400},
		{name: EngineDatabaseURL, owner: opts.PUID, mode: 0o400},
	}
	for _, s := range owners {
		if err := own(opts, filepath.Join(dir, s.name), s.owner, s.owner, s.mode); err != nil {
			return created, err
		}
	}
	return created, nil
}

func randomHex(random io.Reader, size int) (string, error) {
	buffer := make([]byte, size)
	if _, err := io.ReadFull(random, buffer); err != nil {
		return "", fmt.Errorf("generate a password: %w", err)
	}
	return hex.EncodeToString(buffer), nil
}

func randomBase64(random io.Reader, size int) (string, error) {
	buffer := make([]byte, size)
	if _, err := io.ReadFull(random, buffer); err != nil {
		return "", fmt.Errorf("generate the encryption key: %w", err)
	}
	return base64.StdEncoding.EncodeToString(buffer), nil
}

// publicKeyOf derives the engine's public key from the web app's private seed (both base64url,
// as the web app's JWK `d` and `x`).
func publicKeyOf(privateSeed string) (string, error) {
	seed, err := base64.RawURLEncoding.DecodeString(privateSeed)
	if err != nil || len(seed) != ed25519.SeedSize {
		return "", errors.New("engine-private-key is not a base64url Ed25519 seed")
	}
	public, ok := ed25519.NewKeyFromSeed(seed).Public().(ed25519.PublicKey)
	if !ok {
		return "", errors.New("derive the engine public key")
	}
	return base64.RawURLEncoding.EncodeToString(public), nil
}

// DatabaseURL is the connection URL of a role on the Canopy database.
func DatabaseURL(role, password, host string) string {
	address := url.URL{Scheme: "postgres", User: url.UserPassword(role, password), Host: host + ":5432", Path: "/canopy"}
	return address.String()
}

// DefaultRandom is the system's secure random source.
var DefaultRandom = rand.Reader
