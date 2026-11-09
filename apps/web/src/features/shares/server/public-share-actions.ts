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
} from '../shares.utils';
import { findByToken, isSecure, isUnlocked, rememberUnlock } from './public-share';
import { shareStreamTicket } from './share-engine';
import { consumeDownload, type ShareRow } from './share-store';

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
      secure: isSecure(),
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
