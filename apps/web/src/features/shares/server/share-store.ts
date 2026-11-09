import 'server-only';

import { and, desc, eq, gt, isNull, lt, or, sql } from 'drizzle-orm';

import { getDb } from '@/shared/db/client';

import { sharesTable } from './shares.schema';

const columns = {
  id: sharesTable.id,
  tokenSealed: sharesTable.tokenSealed,
  ownerId: sharesTable.ownerId,
  path: sharesTable.path,
  name: sharesTable.name,
  isDirectory: sharesTable.isDirectory,
  passwordHash: sharesTable.passwordHash,
  expiresAt: sharesTable.expiresAt,
  maxDownloads: sharesTable.maxDownloads,
  downloadCount: sharesTable.downloadCount,
  revokedAt: sharesTable.revokedAt,
  lastAccessAt: sharesTable.lastAccessAt,
  createdAt: sharesTable.createdAt,
};

export interface ShareRow {
  id: string;
  tokenSealed: string;
  ownerId: string;
  path: string;
  name: string;
  isDirectory: boolean;
  passwordHash: string | null;
  expiresAt: Date;
  maxDownloads: number | null;
  downloadCount: number;
  revokedAt: Date | null;
  lastAccessAt: Date | null;
  createdAt: Date;
}

export async function insertShare(values: typeof sharesTable.$inferInsert): Promise<ShareRow> {
  const [row] = await getDb().insert(sharesTable).values(values).returning(columns);
  if (!row) throw new Error('share insert returned no row');
  return row;
}

export async function findShareByTokenHash(tokenHash: string): Promise<ShareRow | undefined> {
  const [row] = await getDb()
    .select(columns)
    .from(sharesTable)
    .where(eq(sharesTable.tokenHash, tokenHash))
    .limit(1);
  return row;
}

export async function findShare(id: string): Promise<ShareRow | undefined> {
  const [row] = await getDb()
    .select(columns)
    .from(sharesTable)
    .where(eq(sharesTable.id, id))
    .limit(1);
  return row;
}

/** Links newest first: one person's (ownerId), or everyone's (null). */
export async function listShares(ownerId: string | null, limit = 500): Promise<ShareRow[]> {
  const query = getDb().select(columns).from(sharesTable);
  const filtered = ownerId === null ? query : query.where(eq(sharesTable.ownerId, ownerId));
  return filtered.orderBy(desc(sharesTable.createdAt)).limit(limit);
}

export async function revokeShareRow(id: string): Promise<boolean> {
  const rows = await getDb()
    .update(sharesTable)
    .set({ revokedAt: sql`now()` })
    .where(and(eq(sharesTable.id, id), isNull(sharesTable.revokedAt)))
    .returning({ id: sharesTable.id });
  return rows.length > 0;
}

export async function touchShare(id: string): Promise<void> {
  await getDb()
    .update(sharesTable)
    .set({ lastAccessAt: sql`now()` })
    .where(eq(sharesTable.id, id));
}

/**
 * Counts one download if the link still allows it, in one statement: two visitors racing for the
 * last download cannot both get it.
 */
export async function consumeDownload(id: string): Promise<boolean> {
  const rows = await getDb()
    .update(sharesTable)
    .set({ downloadCount: sql`${sharesTable.downloadCount} + 1`, lastAccessAt: sql`now()` })
    .where(
      and(
        eq(sharesTable.id, id),
        isNull(sharesTable.revokedAt),
        gt(sharesTable.expiresAt, sql`now()`),
        or(
          isNull(sharesTable.maxDownloads),
          lt(sharesTable.downloadCount, sharesTable.maxDownloads),
        ),
      ),
    )
    .returning({ id: sharesTable.id });
  return rows.length > 0;
}
