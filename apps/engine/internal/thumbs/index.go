package thumbs

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// DB is the slice of pgx the index needs.
type DB interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

// PostgresIndex is the Index in engine.thumbnails.
type PostgresIndex struct{ DB DB }

// Touch records a thumbnail; its use time is refreshed at most hourly to spare writes.
func (p PostgresIndex) Touch(ctx context.Context, key string, bytes int64) error {
	_, err := p.DB.Exec(ctx, `
		INSERT INTO engine.thumbnails (key, bytes) VALUES ($1, $2)
		ON CONFLICT (key) DO UPDATE SET used_at = now(), bytes = EXCLUDED.bytes
		WHERE engine.thumbnails.used_at < now() - interval '1 hour'`, key, bytes)
	if err != nil {
		return fmt.Errorf("index thumbnail: %w", err)
	}
	return nil
}

// All lists the indexed thumbnails.
func (p PostgresIndex) All(ctx context.Context) ([]Cached, error) {
	rows, err := p.DB.Query(ctx, `SELECT key, bytes, used_at FROM engine.thumbnails`)
	if err != nil {
		return nil, fmt.Errorf("list thumbnails: %w", err)
	}
	var entries []Cached
	var entry Cached
	_, err = pgx.ForEachRow(rows, []any{&entry.Key, &entry.Bytes, &entry.UsedAt}, func() error {
		entries = append(entries, entry)
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("list thumbnails: %w", err)
	}
	return entries, nil
}

// Remove unindexes thumbnails.
func (p PostgresIndex) Remove(ctx context.Context, keys []string) error {
	if _, err := p.DB.Exec(ctx, `DELETE FROM engine.thumbnails WHERE key = ANY($1)`, keys); err != nil {
		return fmt.Errorf("unindex thumbnails: %w", err)
	}
	return nil
}
