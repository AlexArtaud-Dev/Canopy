import 'server-only';

import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { parseServerEnv } from '@/shared/config/env';
import { AppBaseError } from '@/shared/lib/errors';

export type Database = PostgresJsDatabase;

let connection: { sql: postgres.Sql; db: Database } | undefined;

/** Lazily opens one pool per process; pages that never touch the database never need one. */
export function getConnection(): { sql: postgres.Sql; db: Database } {
  if (connection) {
    return connection;
  }
  const { CANOPY_DATABASE_URL } = parseServerEnv(process.env);
  if (!CANOPY_DATABASE_URL) {
    throw new AppBaseError('system.database_not_configured', 'CANOPY_DATABASE_URL is not set');
  }
  const sql = postgres(CANOPY_DATABASE_URL, {
    max: 10,
    idle_timeout: 30,
    onnotice: () => undefined,
  });
  connection = { sql, db: drizzle(sql) };
  return connection;
}

export function getDb(): Database {
  return getConnection().db;
}
