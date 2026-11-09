package plugins

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// DB is the slice of pgx the store needs.
type DB interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

// PostgresStore keeps plugins in engine.plugins.
type PostgresStore struct{ DB DB }

// All lists installed plugins by id.
func (p PostgresStore) All(ctx context.Context) ([]Record, error) {
	rows, err := p.DB.Query(ctx, `
		SELECT id, version, repo, manifest, enabled, pinned, installed_at, installed_by
		FROM engine.plugins ORDER BY id`)
	if err != nil {
		return nil, fmt.Errorf("list plugins: %w", err)
	}
	var records []Record
	var record Record
	_, err = pgx.ForEachRow(rows, []any{
		&record.ID, &record.Version, &record.Repo, &record.Manifest, &record.Enabled, &record.Pinned,
		&record.InstalledAt, &record.InstalledBy,
	}, func() error {
		records = append(records, record)
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("list plugins: %w", err)
	}
	return records, nil
}

// Save inserts or replaces a plugin (a new version keeps the pin decided by the caller).
func (p PostgresStore) Save(ctx context.Context, record Record) error {
	_, err := p.DB.Exec(ctx, `
		INSERT INTO engine.plugins (id, version, repo, manifest, enabled, pinned, installed_at, installed_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, repo = EXCLUDED.repo,
			manifest = EXCLUDED.manifest, enabled = EXCLUDED.enabled, pinned = EXCLUDED.pinned,
			installed_at = EXCLUDED.installed_at, installed_by = EXCLUDED.installed_by`,
		record.ID, record.Version, record.Repo, record.Manifest, record.Enabled, record.Pinned,
		record.InstalledAt, record.InstalledBy)
	if err != nil {
		return fmt.Errorf("save plugin: %w", err)
	}
	return nil
}

// SetFlags updates enabled and pinned.
func (p PostgresStore) SetFlags(ctx context.Context, id string, enabled, pinned bool) error {
	if _, err := p.DB.Exec(ctx, `UPDATE engine.plugins SET enabled = $2, pinned = $3 WHERE id = $1`, id, enabled, pinned); err != nil {
		return fmt.Errorf("update plugin: %w", err)
	}
	return nil
}

// Delete removes a plugin's record.
func (p PostgresStore) Delete(ctx context.Context, id string) error {
	if _, err := p.DB.Exec(ctx, `DELETE FROM engine.plugins WHERE id = $1`, id); err != nil {
		return fmt.Errorf("delete plugin: %w", err)
	}
	return nil
}
