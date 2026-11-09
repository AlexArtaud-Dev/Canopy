import 'server-only';

import { cookies } from 'next/headers';

import { listDirectory } from '@canopy/contracts';

import { AppBaseError } from '@/shared/lib/errors';
import { openSecret, sealSecret } from '@/shared/secrets/secrets';
import { audit } from '@/features/audit/server/audit-writer';

import {
  relativeShared,
  resolveShared,
  shareStatus,
  tokenSchema,
  type ShareStatus,
} from '../shares.utils';
import { engineClientForShare } from './share-engine';
import { findShareByTokenHash, touchShare, type ShareRow } from './share-store';
import { hashShareToken, unlockPurpose } from './share-tokens';

/** How long an unlocked link stays unlocked in this browser (never past the link itself). */
const unlockMaxSeconds = 12 * 60 * 60;

/** Entries listed for a visitor; a shared folder bigger than this shows its first entries. */
const visitorListLimit = 500;

export interface SharedEntry {
  name: string;
  /** Relative to the shared folder ("/" is the folder itself). */
  path: string;
  isDirectory: boolean;
  size: number;
  modified: string;
}

export interface SharedItem {
  name: string;
  isDirectory: boolean;
  /** ISO 8601. */
  expiresAt: string;
  downloadsLeft: number | null;
}

export type PublicShare =
  | { state: 'missing' }
  | { state: Exclude<ShareStatus, 'active'> }
  | { state: 'locked'; item: SharedItem }
  | {
      state: 'open';
      item: SharedItem;
      /** Folder links: where the visitor is, its entries, and whether more were left out. */
      path: string;
      entries: SharedEntry[];
      truncated: boolean;
    };

function unlockCookie(share: ShareRow): string {
  return `canopy_su_${share.id.replaceAll('-', '')}`;
}

function itemOf(share: ShareRow): SharedItem {
  return {
    name: share.name,
    isDirectory: share.isDirectory,
    expiresAt: share.expiresAt.toISOString(),
    downloadsLeft: share.maxDownloads === null ? null : share.maxDownloads - share.downloadCount,
  };
}

/** The link behind a token, if any (the token's shape is checked before any lookup). */
export async function findByToken(token: string): Promise<ShareRow | undefined> {
  if (!tokenSchema.safeParse(token).success) return undefined;
  return findShareByTokenHash(hashShareToken(token));
}

/** Whether this browser unlocked the link with its password (or it has none). */
export async function isUnlocked(share: ShareRow): Promise<boolean> {
  if (share.passwordHash === null) return true;
  const sealed = (await cookies()).get(unlockCookie(share))?.value;
  if (!sealed) return false;
  try {
    const [id, until] = openSecret(sealed, unlockPurpose).split('.');
    return id === share.id && Number(until) > Date.now();
  } catch {
    return false;
  }
}

/** Remembers in this browser that the right password was given. */
export async function rememberUnlock(share: ShareRow): Promise<void> {
  const seconds = Math.max(
    1,
    Math.min(unlockMaxSeconds, Math.floor((share.expiresAt.getTime() - Date.now()) / 1000)),
  );
  (await cookies()).set(
    unlockCookie(share),
    sealSecret(`${share.id}.${String(Date.now() + seconds * 1000)}`, unlockPurpose),
    { httpOnly: true, sameSite: 'lax', secure: isSecure(), path: '/s', maxAge: seconds },
  );
}

export function isSecure(): boolean {
  return (process.env.CANOPY_PUBLIC_URL ?? '').startsWith('https:');
}

/**
 * What a visitor of `/s/<token>` sees. Every opening of an active, unlocked link is audited (as
 * the owner's link, with the visitor's address from the request context).
 */
export async function loadPublicShare(token: string, relative: string): Promise<PublicShare> {
  const share = await findByToken(token);
  if (!share) return { state: 'missing' };
  const status = shareStatus(share, new Date());
  if (status !== 'active') return { state: status };
  if (!(await isUnlocked(share))) return { state: 'locked', item: itemOf(share) };

  const item = itemOf(share);
  let path = '/';
  let entries: SharedEntry[] = [];
  let truncated = false;
  if (share.isDirectory) {
    const target = resolveShared(share.path, relative);
    if (target === null) return { state: 'missing' };
    const { data, error, response } = await listDirectory({
      client: await engineClientForShare(share),
      query: { path: target, limit: visitorListLimit },
    });
    if (!response) throw new AppBaseError('system.engine_unavailable', 'engine unreachable');
    // The owner lost access, or the folder is gone: the link no longer leads anywhere.
    if (!data) {
      if (error.code === 'files.not_found' || error.code === 'files.forbidden')
        return { state: 'missing' };
      throw new AppBaseError(error.code, 'engine refused the listing');
    }
    path = relativeShared(share.path, data.path);
    entries = data.entries.map((entry) => ({
      name: entry.name,
      path: relativeShared(share.path, entry.path),
      isDirectory: entry.kind === 'directory',
      size: entry.size,
      modified: entry.modified,
    }));
    truncated = data.total > data.entries.length;
  }
  await touchShare(share.id);
  await audit({
    action: 'shares.open',
    result: 'success',
    actorId: null,
    target: share.isDirectory ? (resolveShared(share.path, path) ?? share.path) : share.path,
    meta: { share: share.id, owner: share.ownerId },
  });
  return { state: 'open', item, path, entries, truncated };
}
