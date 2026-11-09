'use server';

import { cookies } from 'next/headers';
import { z } from 'zod';

import { runAction, type ActionResult } from '@/shared/lib/action';
import { AppBaseError } from '@/shared/lib/errors';
import {
  shareTicketCookie,
  shareTicketPath,
  engineTokenLifetimeSeconds,
} from '@/shared/engine/engine-token.utils';
import { enforceRateLimit } from '@/shared/rate-limit/rate-limit';
import { getRequestContext } from '@/shared/request/request-context';
import { audit } from '@/features/audit/server/audit-writer';
import { verifyPassword } from '@/features/auth/server/password';

import {
  resolveShared,
  sharedPathSchema,
  sharePasswordMaxLength,
  shareStatus,
  uploadRefusal,
} from '../shares.utils';
import { findByToken, isSecure, isUnlocked, rememberUnlock } from './public-share';
import { shareStreamTicket, shareUploadTicket } from './share-engine';
import { consumeDownload, reserveUpload, type ShareRow } from './share-store';

/** Wrong passwords per link and address: slow enough that guessing is hopeless. */
const unlockRule = { limit: 10, windowSeconds: 15 * 60 };

const unlockSchema = z.object({
  token: z.string().max(64),
  password: z.string().min(1).max(sharePasswordMaxLength),
});

const downloadSchema = z.object({
  token: z.string().max(64),
  /** Relative to the shared folder; the shared item itself when omitted. */
  path: sharedPathSchema,
  /** A folder downloads as a zip (the engine refuses a mismatch either way). */
  folder: z.boolean().default(false),
});

async function activeShare(token: string): Promise<ShareRow> {
  const share = await findByToken(token);
  if (!share) throw new AppBaseError('shares.not_found', 'no such link');
  const status = shareStatus(share, new Date());
  if (status !== 'active') throw new AppBaseError(`shares.${status}`, 'link not active');
  return share;
}

/** Checks a link's password; the visitor's browser then stays unlocked for a while. */
export async function unlockShare(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const parsed = unlockSchema.safeParse(input);
    if (!parsed.success) throw new AppBaseError('system.bad_request', 'invalid input');
    const share = await activeShare(parsed.data.token);
    if (share.passwordHash === null) return null;
    const { clientIp } = await getRequestContext();
    await enforceRateLimit('shares.unlock', `${share.id}:${clientIp ?? 'unknown'}`, unlockRule);
    if (!(await verifyPassword({ hash: share.passwordHash, password: parsed.data.password }))) {
      await audit({
        action: 'shares.unlock_failed',
        result: 'denied',
        actorId: null,
        target: share.path,
        meta: { share: share.id, owner: share.ownerId },
      });
      throw new AppBaseError('shares.wrong_password', 'wrong password');
    }
    await rememberUnlock(share);
    return null;
  });
}

/**
 * Counts one download, then hands the browser a ticket for exactly that file (or a zip of that
 * folder) through the share relay. The link's limit is enforced atomically.
 */
export async function prepareShareDownload(
  input: unknown,
): Promise<ActionResult<{ href: string }>> {
  return runAction(async () => {
    const parsed = downloadSchema.safeParse(input);
    if (!parsed.success) throw new AppBaseError('system.bad_request', 'invalid input');
    const share = await activeShare(parsed.data.token);
    if (!(await isUnlocked(share))) throw new AppBaseError('shares.locked', 'password needed');
    const target = share.isDirectory ? resolveShared(share.path, parsed.data.path) : share.path;
    if (target === null) throw new AppBaseError('files.invalid_path', 'outside the share');
    if (!(await consumeDownload(share.id)))
      throw new AppBaseError('shares.exhausted', 'no downloads left');

    const ticket = await shareStreamTicket(share, target);
    (await cookies()).set(shareTicketCookie, ticket, {
      httpOnly: true,
      sameSite: 'strict',
      secure: await isSecure(),
      path: shareTicketPath,
      maxAge: engineTokenLifetimeSeconds,
    });
    await audit({
      action: 'shares.download',
      result: 'success',
      actorId: null,
      target,
      meta: { share: share.id, owner: share.ownerId },
    });
    const route = parsed.data.folder ? 'archive' : 'download';
    return { href: `${shareTicketPath}/v1/fs/${route}?path=${encodeURIComponent(target)}` };
  });
}

const uploadSchema = z.object({
  token: z.string().max(64),
  name: z.string().min(1).max(255),
  size: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
});

/**
 * Before each file sent through an upload link: checks it against the link's rules, reserves its
 * place (atomically), then hands the browser a ticket for that one file. The engine checks the
 * name, size and folder again and accepts the ticket for one upload only.
 */
export async function prepareLinkUpload(
  input: unknown,
): Promise<ActionResult<{ endpoint: string; folder: string }>> {
  return runAction(async () => {
    const parsed = uploadSchema.safeParse(input);
    if (!parsed.success || !isFileName(parsed.data.name)) {
      throw new AppBaseError('files.invalid_name', 'invalid file name');
    }
    const file = { name: parsed.data.name, size: parsed.data.size };
    const share = await activeShare(parsed.data.token);
    if (share.kind !== 'upload') throw new AppBaseError('shares.not_found', 'not an upload link');
    if (!(await isUnlocked(share))) throw new AppBaseError('shares.locked', 'password needed');
    const refusal = uploadRefusal(
      {
        allowedExtensions: share.allowedExtensions,
        maxFileBytes: share.maxFileBytes,
        maxTotalBytes: share.maxTotalBytes,
        maxFiles: share.maxFiles,
      },
      share,
      file,
    );
    if (refusal) throw new AppBaseError(refusal, 'outside the link rules');
    if (!(await reserveUpload(share.id, file.size))) {
      throw new AppBaseError('shares.total_exceeded', 'no room left on the link');
    }
    (await cookies()).set(shareTicketCookie, await shareUploadTicket(share, file), {
      httpOnly: true,
      sameSite: 'strict',
      secure: await isSecure(),
      path: shareTicketPath,
      maxAge: engineTokenLifetimeSeconds,
    });
    await audit({
      action: 'shares.upload',
      result: 'success',
      actorId: null,
      target: share.path,
      meta: { share: share.id, owner: share.ownerId, name: file.name, bytes: file.size },
    });
    return { endpoint: `${shareTicketPath}/v1/uploads/`, folder: share.path };
  });
}

/** One plain file name: no folders, no control characters, nothing the system keeps for itself. */
function isFileName(name: string): boolean {
  if (name === '.' || name === '..' || name.startsWith('.canopy-')) return false;
  for (let index = 0; index < name.length; index += 1) {
    // Control characters and separators are all single UTF-16 units.
    const code = name.charCodeAt(index);
    if (code < 0x20 || code === 0x2f || code === 0x5c) return false;
  }
  return true;
}
