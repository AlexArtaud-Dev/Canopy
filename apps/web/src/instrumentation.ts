// Runs once when the server process starts, before any request is served.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || !process.env.CANOPY_DATABASE_URL) {
    return;
  }
  const { runMigrations } = await import('@/shared/db/migrate');
  await runMigrations();
}
