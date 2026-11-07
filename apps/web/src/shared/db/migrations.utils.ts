interface Migration {
  folderMillis: number;
}

/** Migrations newer than the last applied one, oldest first (Drizzle's ordering rule). */
export function pendingMigrations<T extends Migration>(
  migrations: readonly T[],
  lastAppliedMillis: string | number | null,
): T[] {
  const last = lastAppliedMillis === null ? -1 : Number(lastAppliedMillis);
  return migrations
    .filter((migration) => migration.folderMillis > last)
    .sort((a, b) => a.folderMillis - b.folderMillis);
}
