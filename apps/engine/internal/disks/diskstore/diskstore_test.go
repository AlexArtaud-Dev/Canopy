package diskstore

import (
	"context"
	"io"
	"log/slog"
	"os"
	"testing"
	"time"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/database"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/disks"
)

// Integration test: runs only when a disposable Postgres is provided (compose dev stack or CI).
func TestStore(t *testing.T) {
	dsn := os.Getenv("CANOPY_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("CANOPY_TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	pool, err := database.Open(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	if err := database.Migrate(ctx, pool, slog.New(slog.NewTextHandler(io.Discard, nil))); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `TRUNCATE engine.disk_readings, engine.disk_alerts`); err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 11, 24, 12, 0, 0, 0, time.UTC)
	store := Store{Pool: pool, Now: func() time.Time { return now }}

	empty, err := store.Load(ctx)
	if err != nil || empty.CheckedAt != nil || len(empty.Disks) != 0 {
		t.Fatalf("empty: %+v %v", empty, err)
	}
	temperature := int64(40)
	state := disks.State{Disks: []disks.Disk{
		{ID: "sdb", Model: "WD", Temperature: &temperature, Reasons: []string{}},
		{ID: "nvme0", Model: "Samsung", Reasons: []string{}},
	}}
	alerts := []disks.Alert{{Disk: "sdb", Kind: disks.AlertHot}, {Disk: "nvme0", Kind: disks.AlertFailing}}
	if err := store.Save(ctx, state, alerts); err != nil {
		t.Fatal(err)
	}
	loaded, err := store.Load(ctx)
	if err != nil || !loaded.CheckedAt.Equal(now) || len(loaded.Disks) != 2 || loaded.Disks[0].ID != "sdb" ||
		*loaded.Disks[0].Temperature != 40 {
		t.Fatalf("loaded %+v %v", loaded, err)
	}

	// The next reading replaces the previous one.
	if err := store.Save(ctx, disks.State{CheckedAt: &now, Disks: state.Disks[1:]}, nil); err != nil {
		t.Fatal(err)
	}
	if loaded, _ := store.Load(ctx); len(loaded.Disks) != 1 || loaded.Disks[0].ID != "nvme0" {
		t.Fatalf("replaced %+v", loaded)
	}

	first, err := store.Claim(ctx, 1)
	if err != nil || len(first) != 1 || first[0].Kind != disks.AlertHot {
		t.Fatalf("first claim %+v %v", first, err)
	}
	rest, _ := store.Claim(ctx, 10)
	if len(rest) != 1 || rest[0].Kind != disks.AlertFailing {
		t.Fatalf("second claim %+v", rest)
	}
	if again, _ := store.Claim(ctx, 10); len(again) != 0 {
		t.Fatalf("claimed twice %+v", again)
	}
	if err := store.Purge(ctx, now.Add(time.Second)); err != nil {
		t.Fatal(err)
	}
	var left int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM engine.disk_alerts`).Scan(&left); err != nil || left != 0 {
		t.Fatalf("left %d %v", left, err)
	}
}
