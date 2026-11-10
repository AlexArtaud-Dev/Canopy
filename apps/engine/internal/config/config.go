// Package config loads the engine bootstrap configuration from environment variables.
// Only bootstrap values live here; everything else is an admin setting stored in the database.
package config

import (
	"fmt"
	"log/slog"
	"path"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
)

const (
	defaultAddr     = ":8080"
	defaultRoot     = "/srv/canopy/root"
	defaultCacheDir = "/srv/canopy/cache"
	defaultPlugins  = "/srv/canopy/plugins"
	defaultLogLevel = slog.LevelInfo
	defaultUmask    = 0o022
)

// Config is the validated bootstrap configuration of the engine.
type Config struct {
	Addr        string
	DatabaseURL string
	Root        string
	// CacheDir holds rebuildable data (thumbnails), outside the root so it never shows as files.
	CacheDir string
	// PluginsDir holds installed plugin binaries (checked against their release checksums).
	PluginsDir string
	// PublicKey verifies web-signed engine tokens; empty disables the /v1 API.
	PublicKey string
	LogLevel  slog.Level
	// Umask applies to every file the engine creates (linuxserver-style UMASK, octal).
	Umask int
	// VideoEncoder picks how videos are re-encoded: "auto" (the GPU when one works), "cpu" or
	// "nvenc" (NVIDIA).
	VideoEncoder string
}

// ErrorCode identifies a configuration error independently of its message.
type ErrorCode string

// Configuration error codes.
const (
	CodeMissing ErrorCode = "config.missing"
	CodeInvalid ErrorCode = "config.invalid"
)

// Error reports which variable is wrong without echoing its value, since DSNs carry secrets.
type Error struct {
	Code ErrorCode
	Key  string
}

func (e *Error) Error() string {
	return fmt.Sprintf("%s: %s", e.Code, e.Key)
}

// Load reads the configuration through getenv so tests never touch the process environment.
func Load(getenv func(string) string) (Config, error) {
	cfg := Config{
		Addr:         valueOr(getenv("CANOPY_ENGINE_ADDR"), defaultAddr),
		DatabaseURL:  strings.TrimSpace(getenv("CANOPY_DATABASE_URL")),
		Root:         valueOr(getenv("CANOPY_ROOT"), defaultRoot),
		CacheDir:     valueOr(getenv("CANOPY_CACHE_DIR"), defaultCacheDir),
		PluginsDir:   valueOr(getenv("CANOPY_PLUGINS_DIR"), defaultPlugins),
		PublicKey:    strings.TrimSpace(getenv("CANOPY_ENGINE_PUBLIC_KEY")),
		LogLevel:     defaultLogLevel,
		Umask:        defaultUmask,
		VideoEncoder: strings.ToLower(valueOr(getenv("CANOPY_VIDEO_ENCODER"), "auto")),
	}
	if !slices.Contains([]string{"auto", "cpu", "nvenc"}, cfg.VideoEncoder) {
		return Config{}, &Error{Code: CodeInvalid, Key: "CANOPY_VIDEO_ENCODER"}
	}

	if cfg.DatabaseURL == "" {
		return Config{}, &Error{Code: CodeMissing, Key: "CANOPY_DATABASE_URL"}
	}

	// The root is a host path: POSIX in containers, a drive path when developing on Windows.
	if !path.IsAbs(cfg.Root) && !filepath.IsAbs(cfg.Root) {
		return Config{}, &Error{Code: CodeInvalid, Key: "CANOPY_ROOT"}
	}
	cfg.Root = filepath.ToSlash(filepath.Clean(cfg.Root))
	if !path.IsAbs(cfg.CacheDir) && !filepath.IsAbs(cfg.CacheDir) {
		return Config{}, &Error{Code: CodeInvalid, Key: "CANOPY_CACHE_DIR"}
	}
	cfg.CacheDir = filepath.ToSlash(filepath.Clean(cfg.CacheDir))
	if !path.IsAbs(cfg.PluginsDir) && !filepath.IsAbs(cfg.PluginsDir) {
		return Config{}, &Error{Code: CodeInvalid, Key: "CANOPY_PLUGINS_DIR"}
	}
	cfg.PluginsDir = filepath.ToSlash(filepath.Clean(cfg.PluginsDir))

	if raw := strings.TrimSpace(getenv("CANOPY_LOG_LEVEL")); raw != "" {
		if err := cfg.LogLevel.UnmarshalText([]byte(raw)); err != nil {
			return Config{}, &Error{Code: CodeInvalid, Key: "CANOPY_LOG_LEVEL"}
		}
	}

	if raw := strings.TrimSpace(getenv("UMASK")); raw != "" {
		umask, err := strconv.ParseUint(raw, 8, 32)
		if err != nil || umask > 0o777 {
			return Config{}, &Error{Code: CodeInvalid, Key: "UMASK"}
		}
		cfg.Umask = int(umask)
	}

	return cfg, nil
}

func valueOr(value, fallback string) string {
	if trimmed := strings.TrimSpace(value); trimmed != "" {
		return trimmed
	}
	return fallback
}

// WithFiles adds the Docker convention to getenv: when NAME is empty and NAME_FILE names a
// file, NAME is that file's content (secrets stay out of the environment). NAME always wins.
func WithFiles(getenv func(string) string, readFile func(string) ([]byte, error)) func(string) string {
	return func(name string) string {
		if value := getenv(name); value != "" {
			return value
		}
		file := getenv(name + "_FILE")
		if file == "" {
			return ""
		}
		data, err := readFile(file)
		if err != nil {
			return ""
		}
		return strings.TrimSpace(string(data))
	}
}
