import 'server-only';

import { and, asc, count, eq } from 'drizzle-orm';

import { getDb } from '@/shared/db/client';

import { favoriteFoldersTable } from './favorites.schema';

/** A person's favorite folders, oldest first (the order they were pinned). */
export async function listFavoritePaths(userId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ path: favoriteFoldersTable.path })
    .from(favoriteFoldersTable)
    .where(eq(favoriteFoldersTable.userId, userId))
    .orderBy(asc(favoriteFoldersTable.createdAt));
  return rows.map((row) => row.path);
}

export async function countFavorites(userId: string): Promise<number> {
  const [row] = await getDb()
    .select({ total: count() })
    .from(favoriteFoldersTable)
    .where(eq(favoriteFoldersTable.userId, userId));
  return row?.total ?? 0;
}

/** Pins a folder; pinning it twice changes nothing. */
export async function insertFavorite(userId: string, path: string): Promise<void> {
  await getDb().insert(favoriteFoldersTable).values({ userId, path }).onConflictDoNothing();
}

/** Unpins a folder; true when it was pinned. */
export async function deleteFavorite(userId: string, path: string): Promise<boolean> {
  const removed = await getDb()
    .delete(favoriteFoldersTable)
    .where(and(eq(favoriteFoldersTable.userId, userId), eq(favoriteFoldersTable.path, path)))
    .returning({ id: favoriteFoldersTable.id });
  return removed.length > 0;
}
