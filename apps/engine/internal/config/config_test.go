package config

import (
	"errors"
	"log/slog"
	"testing"
)

func envOf(values map[string]string) func(string) string {
	return func(key string) string { return values[key] }
}

func TestLoad(t *testing.T) {
	t.Parallel()

	const dsn = "postgres://engine@db/canopy"

	tests := []struct {
		name    string
		env     map[string]string
		want    Config
		wantErr *Error
	}{
		{
			name: "defaults",
			env:  map[string]string{"CANOPY_DATABASE_URL": dsn},
			want: Config{Addr: ":8080", DatabaseURL: dsn, Root: "/srv/canopy/root", CacheDir: "/srv/canopy/cache", PluginsDir: "/srv/canopy/plugins", LogLevel: slog.LevelInfo, Umask: 0o022, VideoEncoder: "auto"},
		},
		{
			name: "overrides are trimmed and cleaned",
			env: map[string]string{
				"CANOPY_DATABASE_URL":  " " + dsn + " ",
				"CANOPY_ENGINE_ADDR":   " 127.0.0.1:9000 ",
				"CANOPY_ROOT":          "/data/root/../root/",
				"CANOPY_CACHE_DIR":     "/var/cache//canopy/",
				"CANOPY_PLUGINS_DIR":   "/opt/plugins/",
				"CANOPY_LOG_LEVEL":     "debug",
				"UMASK":                "002",
				"CANOPY_VIDEO_ENCODER": "NVENC",
			},
			want: Config{Addr: "127.0.0.1:9000", DatabaseURL: dsn, Root: "/data/root", CacheDir: "/var/cache/canopy", PluginsDir: "/opt/plugins", LogLevel: slog.LevelDebug, Umask: 0o002, VideoEncoder: "nvenc"},
		},
		{
			name:    "unknown video encoder",
			env:     map[string]string{"CANOPY_DATABASE_URL": dsn, "CANOPY_VIDEO_ENCODER": "quicksync"},
			wantErr: &Error{Code: CodeInvalid, Key: "CANOPY_VIDEO_ENCODER"},
		},
		{
			name:    "missing database url",
			env:     map[string]string{},
			wantErr: &Error{Code: CodeMissing, Key: "CANOPY_DATABASE_URL"},
		},
		{
			name:    "relative root",
			env:     map[string]string{"CANOPY_DATABASE_URL": dsn, "CANOPY_ROOT": "data"},
			wantErr: &Error{Code: CodeInvalid, Key: "CANOPY_ROOT"},
		},
		{
			name:    "relative cache folder",
			env:     map[string]string{"CANOPY_DATABASE_URL": dsn, "CANOPY_CACHE_DIR": "cache"},
			wantErr: &Error{Code: CodeInvalid, Key: "CANOPY_CACHE_DIR"},
		},
		{
			name:    "relative plugins folder",
			env:     map[string]string{"CANOPY_DATABASE_URL": dsn, "CANOPY_PLUGINS_DIR": "plugins"},
			wantErr: &Error{Code: CodeInvalid, Key: "CANOPY_PLUGINS_DIR"},
		},
		{
			name:    "non-octal umask",
			env:     map[string]string{"CANOPY_DATABASE_URL": dsn, "UMASK": "089"},
			wantErr: &Error{Code: CodeInvalid, Key: "UMASK"},
		},
		{
			name:    "umask out of range",
			env:     map[string]string{"CANOPY_DATABASE_URL": dsn, "UMASK": "1777"},
			wantErr: &Error{Code: CodeInvalid, Key: "UMASK"},
		},
		{
			name:    "unknown log level",
			env:     map[string]string{"CANOPY_DATABASE_URL": dsn, "CANOPY_LOG_LEVEL": "loud"},
			wantErr: &Error{Code: CodeInvalid, Key: "CANOPY_LOG_LEVEL"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got, err := Load(envOf(tt.env))
			if tt.wantErr != nil {
				var cfgErr *Error
				if !errors.As(err, &cfgErr) || *cfgErr != *tt.wantErr {
					t.Fatalf("Load() error = %v, want %v", err, tt.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("Load() unexpected error: %v", err)
			}
			if got != tt.want {
				t.Fatalf("Load() = %+v, want %+v", got, tt.want)
			}
		})
	}
}

func TestErrorMessageOmitsValue(t *testing.T) {
	t.Parallel()

	err := &Error{Code: CodeInvalid, Key: "CANOPY_ROOT"}
	if got, want := err.Error(), "config.invalid: CANOPY_ROOT"; got != want {
		t.Fatalf("Error() = %q, want %q", got, want)
	}
}
