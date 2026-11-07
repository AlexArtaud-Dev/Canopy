package database

import (
	"bytes"
	"context"
	"log/slog"
	"os"
	"testing"
)

// Integration test: runs only when a disposable Postgres is provided (compose dev stack or CI).
func TestOpenAndMigrate(t *testing.T) {
	dsn := os.Getenv("CANOPY_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("CANOPY_TEST_DATABASE_URL not set")
	}

	ctx := context.Background()
	pool, err := Open(ctx, dsn)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(pool.Close)

	logger := slog.New(slog.NewTextHandler(&bytes.Buffer{}, nil))
	for range 2 { // second run proves migrations are idempotent
		if err := Migrate(ctx, pool, logger); err != nil {
			t.Fatalf("Migrate: %v", err)
		}
	}

	var version int64
	err = pool.QueryRow(ctx, "SELECT max(version_id) FROM "+versionTable).Scan(&version)
	if err != nil {
		t.Fatalf("read version: %v", err)
	}
	if version < 1 {
		t.Fatalf("version = %d, want >= 1", version)
	}
}

func TestOpenRejectsInvalidDSN(t *testing.T) {
	t.Parallel()

	if _, err := Open(context.Background(), "postgres://%zz"); err == nil {
		t.Fatal("Open should fail on an invalid DSN")
	}
}
