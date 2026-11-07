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
			want: Config{Addr: ":8080", DatabaseURL: dsn, Root: "/srv/canopy/root", LogLevel: slog.LevelInfo},
		},
		{
			name: "overrides are trimmed and cleaned",
			env: map[string]string{
				"CANOPY_DATABASE_URL": " " + dsn + " ",
				"CANOPY_ENGINE_ADDR":  " 127.0.0.1:9000 ",
				"CANOPY_ROOT":         "/data/root/../root/",
				"CANOPY_LOG_LEVEL":    "debug",
			},
			want: Config{Addr: "127.0.0.1:9000", DatabaseURL: dsn, Root: "/data/root", LogLevel: slog.LevelDebug},
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
