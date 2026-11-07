import 'server-only';

import path from 'node:path';

import { readMigrationFiles } from 'drizzle-orm/migrator';

import { logger } from '@/shared/lib/logger';

import { getConnection } from './client';
import { pendingMigrations } from './migrations.utils';

/**
 * Applies drizzle-kit migrations. Drizzle's own migrator starts with `CREATE SCHEMA IF NOT EXISTS`,
 * which Postgres rejects for a role without CREATE on the database — the web role deliberately
 * lacks it. Same files and bookkeeping format as Drizzle, so drizzle-kit keeps working.
 */
export async function runMigrations(): Promise<void> {
  const started = Date.now();
  const { sql } = getConnection();
  // Standalone output chdirs into the app folder, which also holds `drizzle/`.
  const migrations = readMigrationFiles({ migrationsFolder: path.join(process.cwd(), 'drizzle') });

  const applied = await sql.begin(async (tx) => {
    // Serializes concurrent starts (several replicas or a fast restart).
    await tx`SELECT pg_advisory_xact_lock(hashtext('canopy.web.migrations'))`;
    await tx`CREATE TABLE IF NOT EXISTS app.__drizzle_migrations (
      id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`;
    const [last] = await tx<{ created_at: string | null }[]>`
      SELECT created_at FROM app.__drizzle_migrations ORDER BY created_at DESC LIMIT 1`;

    const pending = pendingMigrations(migrations, last?.created_at ?? null);
    for (const migration of pending) {
      for (const statement of migration.sql) {
        await tx.unsafe(statement);
      }
      await tx`INSERT INTO app.__drizzle_migrations (hash, created_at)
        VALUES (${migration.hash}, ${migration.folderMillis})`;
    }
    return pending.length;
  });

  logger.info('database migrations applied', {
    module: 'db',
    applied,
    durationMs: Date.now() - started,
  });
}
