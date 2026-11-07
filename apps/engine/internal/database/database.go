// Package database owns the engine's Postgres connection pool and its schema migrations.
package database

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"log/slog"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
)

//go:embed migrations/*.sql
var migrations embed.FS

// The goose bookkeeping table lives in the engine schema so the engine role never writes to public.
const versionTable = "engine.goose_db_version"

// Open connects to Postgres and verifies the connection.
func Open(ctx context.Context, dsn string) (*pgxpool.Pool, error) {
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, fmt.Errorf("database: create pool: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("database: ping: %w", err)
	}
	return pool, nil
}

// Migrate applies pending engine migrations.
func Migrate(ctx context.Context, pool *pgxpool.Pool, logger *slog.Logger) error {
	db := stdlib.OpenDBFromPool(pool)
	defer func() { _ = db.Close() }()

	dir, err := fs.Sub(migrations, "migrations")
	if err != nil {
		return fmt.Errorf("database: migrations dir: %w", err)
	}

	provider, err := goose.NewProvider(goose.DialectPostgres, db, dir,
		goose.WithTableName(versionTable),
	)
	if err != nil {
		return fmt.Errorf("database: migration provider: %w", err)
	}

	results, err := provider.Up(ctx)
	if err != nil {
		return fmt.Errorf("database: migrate: %w", err)
	}
	for _, result := range results {
		logger.Info("migration applied", slog.Int64("version", result.Source.Version), slog.Duration("duration", result.Duration))
	}
	return nil
}
