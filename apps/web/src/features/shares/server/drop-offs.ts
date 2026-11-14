import 'server-only';

import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { cookies } from 'next/headers';

import { getDb } from '@/shared/db/client';
import { openSecret, sealSecret } from '@/shared/secrets/secrets';

import { dropOffCodeLength, dropOffCodeTtlMs, type DropOffState } from '../shares.utils';
import { currentRequestIsSecure as isSecure } from '@/shared/request/secure-request';
import type { ShareRow } from './share-store';
import { shareDropOffFilesTable, shareDropOffsTable } from './shares.schema';

const dropOffPurpose = 'shares.drop_off';
/** A visit stays the same drop-off this long (never past the link itself). */
const visitMaxSeconds = 12 * 60 * 60;

/** A drop-off as the server reads it. */
export interface DropOffRow {
  id: string;
  shareId: string;
  name: string | null;
  email: string | null;
  verifiedAt: Date | null;
  codeHash: string | null;
  codeExpiresAt: Date | null;
  codeAttempts: number;
}

const columns = {
  id: shareDropOffsTable.id,
  shareId: shareDropOffsTable.shareId,
  name: shareDropOffsTable.name,
  email: shareDropOffsTable.email,
  verifiedAt: shareDropOffsTable.verifiedAt,
  codeHash: shareDropOffsTable.codeHash,
  codeExpiresAt: shareDropOffsTable.codeExpiresAt,
  codeAttempts: shareDropOffsTable.codeAttempts,
};

function cookieName(share: ShareRow): string {
  return `canopy_sd_${share.id.replaceAll('-', '')}`;
}

/** The drop-off this browser is making on the link, if any. */
export async function currentDropOff(share: ShareRow): Promise<DropOffRow | null> {
  const sealed = (await cookies()).get(cookieName(share))?.value;
  if (!sealed) return null;
  let id: string | undefined;
  try {
    const [value, until] = openSecret(sealed, dropOffPurpose).split('.');
    if (Number(until) <= Date.now()) return null;
    id = value;
  } catch {
    return null;
  }
  if (!id) return null;
  const [row] = await getDb()
    .select(columns)
    .from(shareDropOffsTable)
    .where(and(eq(shareDropOffsTable.id, id), eq(shareDropOffsTable.shareId, share.id)));
  return row ?? null;
}

/** The visitor's side of a drop-off: never the code. */
export function dropOffState(row: DropOffRow | null, now: Date): DropOffState | null {
  if (!row) return null;
  return {
    name: row.name,
    email: row.email,
    verified: row.verifiedAt !== null,
    codePending: row.codeHash !== null && row.codeExpiresAt !== null && row.codeExpiresAt > now,
  };
}

/** Starts a drop-off (who the depositor says they are, if the link asks) and remembers it here. */
export async function startDropOff(
  share: ShareRow,
  depositor: { name: string; email: string } | null,
): Promise<DropOffRow> {
  const [row] = await getDb()
    .insert(shareDropOffsTable)
    .values({ shareId: share.id, name: depositor?.name ?? null, email: depositor?.email ?? null })
    .returning(columns);
  if (!row) throw new Error('drop-off insert returned no row');
  const seconds = Math.max(
    1,
    Math.min(visitMaxSeconds, Math.floor((share.expiresAt.getTime() - Date.now()) / 1000)),
  );
  (await cookies()).set(
    cookieName(share),
    sealSecret(`${row.id}.${String(Date.now() + seconds * 1000)}`, dropOffPurpose),
    { httpOnly: true, sameSite: 'lax', secure: await isSecure(), path: '/s', maxAge: seconds },
  );
  return row;
}

function hashCode(dropOffId: string, code: string): string {
  return createHash('sha256').update(`${dropOffId}:${code}`).digest('hex');
}

/** A new code for the drop-off's e-mail (the previous one stops working). */
export async function issueCode(dropOff: DropOffRow): Promise<string> {
  const code = String(randomInt(0, 10 ** dropOffCodeLength)).padStart(dropOffCodeLength, '0');
  await getDb()
    .update(shareDropOffsTable)
    .set({
      codeHash: hashCode(dropOff.id, code),
      codeExpiresAt: new Date(Date.now() + dropOffCodeTtlMs),
      codeAttempts: 0,
    })
    .where(eq(shareDropOffsTable.id, dropOff.id));
  return code;
}

/** Whether `code` is the pending one; counts the attempt either way. */
export async function checkCode(dropOff: DropOffRow, code: string): Promise<boolean> {
  await getDb()
    .update(shareDropOffsTable)
    .set({ codeAttempts: sql`${shareDropOffsTable.codeAttempts} + 1` })
    .where(eq(shareDropOffsTable.id, dropOff.id));
  if (dropOff.codeHash === null) return false;
  const expected = Buffer.from(dropOff.codeHash, 'hex');
  const given = Buffer.from(hashCode(dropOff.id, code), 'hex');
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export async function markVerified(dropOffId: string): Promise<void> {
  await getDb()
    .update(shareDropOffsTable)
    .set({ verifiedAt: new Date(), codeHash: null, codeExpiresAt: null })
    .where(eq(shareDropOffsTable.id, dropOffId));
}

/** Records one file of a drop-off as its upload starts. */
export async function recordDropOffFile(
  dropOffId: string,
  file: { name: string; size: number },
): Promise<void> {
  await getDb().transaction(async (tx) => {
    await tx
      .insert(shareDropOffFilesTable)
      .values({ dropOffId, name: file.name, bytes: file.size });
    await tx
      .update(shareDropOffsTable)
      .set({
        fileCount: sql`${shareDropOffsTable.fileCount} + 1`,
        byteCount: sql`${shareDropOffsTable.byteCount} + ${file.size}`,
        lastUploadAt: new Date(),
      })
      .where(eq(shareDropOffsTable.id, dropOffId));
  });
}

/** A drop-off as the link's owner sees it. */
export interface DropOffView {
  id: string;
  name: string | null;
  email: string | null;
  verified: boolean;
  fileCount: number;
  byteCount: number;
  /** ISO 8601. */
  createdAt: string;
  lastUploadAt: string | null;
  files: { name: string; bytes: number }[];
}

/** Files listed per drop-off in the owner's history; the counts stay exact beyond. */
const filesPerDropOff = 200;

/** A link's drop-offs that sent something, latest first. */
export async function listDropOffs(shareId: string, limit = 200): Promise<DropOffView[]> {
  const rows = await getDb()
    .select({
      id: shareDropOffsTable.id,
      name: shareDropOffsTable.name,
      email: shareDropOffsTable.email,
      verifiedAt: shareDropOffsTable.verifiedAt,
      fileCount: shareDropOffsTable.fileCount,
      byteCount: shareDropOffsTable.byteCount,
      createdAt: shareDropOffsTable.createdAt,
      lastUploadAt: shareDropOffsTable.lastUploadAt,
    })
    .from(shareDropOffsTable)
    .where(and(eq(shareDropOffsTable.shareId, shareId), sql`${shareDropOffsTable.fileCount} > 0`))
    .orderBy(desc(shareDropOffsTable.createdAt))
    .limit(limit);
  if (rows.length === 0) return [];
  const files = await getDb()
    .select({
      dropOffId: shareDropOffFilesTable.dropOffId,
      name: shareDropOffFilesTable.name,
      bytes: shareDropOffFilesTable.bytes,
    })
    .from(shareDropOffFilesTable)
    .where(
      inArray(
        shareDropOffFilesTable.dropOffId,
        rows.map((row) => row.id),
      ),
    )
    .orderBy(shareDropOffFilesTable.createdAt);
  const byDropOff = new Map<string, { name: string; bytes: number }[]>();
  for (const file of files) {
    const list = byDropOff.get(file.dropOffId) ?? [];
    if (list.length < filesPerDropOff) list.push({ name: file.name, bytes: file.bytes });
    byDropOff.set(file.dropOffId, list);
  }
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    verified: row.verifiedAt !== null,
    fileCount: row.fileCount,
    byteCount: row.byteCount,
    createdAt: row.createdAt.toISOString(),
    lastUploadAt: row.lastUploadAt?.toISOString() ?? null,
    files: byDropOff.get(row.id) ?? [],
  }));
}

/** How many drop-offs sent something, per link. */
export async function countDropOffs(shareIds: readonly string[]): Promise<Map<string, number>> {
  if (shareIds.length === 0) return new Map();
  const rows = await getDb()
    .select({ shareId: shareDropOffsTable.shareId, total: sql<number>`count(*)::int` })
    .from(shareDropOffsTable)
    .where(
      and(inArray(shareDropOffsTable.shareId, shareIds), sql`${shareDropOffsTable.fileCount} > 0`),
    )
    .groupBy(shareDropOffsTable.shareId);
  return new Map(rows.map((row) => [row.shareId, row.total]));
}

export async function findDropOff(id: string): Promise<{ id: string; shareId: string } | null> {
  const [row] = await getDb()
    .select({ id: shareDropOffsTable.id, shareId: shareDropOffsTable.shareId })
    .from(shareDropOffsTable)
    .where(eq(shareDropOffsTable.id, id));
  return row ?? null;
}

/** Erases a drop-off and its file list (the files themselves stay in the folder). */
export async function deleteDropOff(id: string): Promise<void> {
  await getDb().delete(shareDropOffsTable).where(eq(shareDropOffsTable.id, id));
}

/** Forgets drop-offs older than the retention period; returns how many went. */
export async function purgeDropOffs(before: Date): Promise<number> {
  const rows = await getDb()
    .delete(shareDropOffsTable)
    .where(lt(shareDropOffsTable.createdAt, before))
    .returning({ id: shareDropOffsTable.id });
  return rows.length;
}
