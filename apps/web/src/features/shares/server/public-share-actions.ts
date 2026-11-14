'use server';

import { cookies } from 'next/headers';
import { getLocale } from 'next-intl/server';
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
import { isMailConfigured } from '@/features/mail/mail.utils';
import { getMailSettings, sendMail } from '@/features/mail/server/mailer';
import { dropOffCodeEmail } from '@/features/mail/templates/templates';

import {
  codeRefusal,
  depositorSchema,
  dropOffCodeSchema,
  dropOffStep,
  resolveShared,
  sharedPathSchema,
  sharePasswordMaxLength,
  shareStatus,
  uploadRefusal,
  type DropOffState,
} from '../shares.utils';
import {
  checkCode,
  currentDropOff,
  dropOffState,
  issueCode,
  markVerified,
  recordDropOffFile,
  startDropOff,
} from './drop-offs';
import { findByToken, isSecure, isUnlocked, rememberUnlock } from './public-share';
import { shareStreamTicket, shareUploadTicket } from './share-engine';
import { consumeDownload, reserveUpload, type ShareRow } from './share-store';

/** Wrong passwords per link and address: slow enough that guessing is hopeless. */
const unlockRule = { limit: 10, windowSeconds: 15 * 60 };
/** Codes sent per link and address: nobody turns an upload page into a mail cannon. */
const codeRule = { limit: 5, windowSeconds: 15 * 60 };

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

/** An upload link the visitor may use (active, unlocked). */
async function openUploadLink(token: string): Promise<ShareRow> {
  const share = await activeShare(token);
  if (share.kind !== 'upload') throw new AppBaseError('shares.not_found', 'not an upload link');
  if (!(await isUnlocked(share))) throw new AppBaseError('shares.locked', 'password needed');
  return share;
}

/**
 * The depositor says who they are, when the link asks. A link verifying e-mails sends a code to
 * it: files go only once the code is typed.
 */
export async function declareDepositor(input: unknown): Promise<ActionResult<DropOffState>> {
  return runAction(async () => {
    const parsed = depositorSchema.safeParse(input);
    if (!parsed.success) throw new AppBaseError('system.bad_request', 'invalid input');
    const { token, name, email } = parsed.data;
    const share = await openUploadLink(token);
    if (share.identity === 'none') throw new AppBaseError('system.bad_request', 'nothing asked');
    const verify = share.identity === 'verified';
    if (verify) {
      if (!isMailConfigured(await getMailSettings())) {
        throw new AppBaseError('shares.identity_unavailable', 'e-mail is not working');
      }
      const { clientIp } = await getRequestContext();
      await enforceRateLimit(
        'shares.drop_off_code',
        `${share.id}:${clientIp ?? 'unknown'}`,
        codeRule,
      );
    }
    const dropOff = await startDropOff(share, { name, email });
    await audit({
      action: 'shares.drop_off_start',
      result: 'success',
      actorId: null,
      target: share.path,
      meta: { share: share.id, owner: share.ownerId, dropOff: dropOff.id, email, verify },
    });
    if (verify) {
      const code = await issueCode(dropOff);
      const mail = await dropOffCodeEmail(await getLocale(), { code, name: share.name });
      await sendMail({ kind: 'shares.drop_off_code', to: email, ...mail });
    }
    return { name, email, verified: false, codePending: verify };
  });
}

/** The depositor types the code sent to their e-mail. */
export async function confirmDepositor(input: unknown): Promise<ActionResult<DropOffState>> {
  return runAction(async () => {
    const parsed = dropOffCodeSchema.safeParse(input);
    if (!parsed.success) throw new AppBaseError('shares.code_invalid', 'invalid code');
    const share = await openUploadLink(parsed.data.token);
    const dropOff = await currentDropOff(share);
    if (!dropOff) throw new AppBaseError('shares.code_expired', 'no code pending');
    const matches = await checkCode(dropOff, parsed.data.code);
    const refusal = codeRefusal(dropOff, matches, new Date());
    if (refusal) {
      await audit({
        action: 'shares.drop_off_verify',
        result: 'denied',
        actorId: null,
        target: share.path,
        meta: { share: share.id, owner: share.ownerId, dropOff: dropOff.id, reason: refusal },
      });
      throw new AppBaseError(refusal, 'code refused');
    }
    await markVerified(dropOff.id);
    await audit({
      action: 'shares.drop_off_verify',
      result: 'success',
      actorId: null,
      target: share.path,
      meta: { share: share.id, owner: share.ownerId, dropOff: dropOff.id, email: dropOff.email },
    });
    return { name: dropOff.name, email: dropOff.email, verified: true, codePending: false };
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
    const share = await openUploadLink(parsed.data.token);
    const known = await currentDropOff(share);
    if (dropOffStep(share.identity, dropOffState(known, new Date())) !== 'ready') {
      throw new AppBaseError('shares.identity_required', 'depositor unknown');
    }
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
    // A link asking nothing still groups a visit's files, so that its owner sees each drop-off.
    const dropOff = known ?? (await startDropOff(share, null));
    await recordDropOffFile(dropOff.id, file);
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
      meta: {
        share: share.id,
        owner: share.ownerId,
        name: file.name,
        bytes: file.size,
        dropOff: dropOff.id,
        depositor: dropOff.email,
      },
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
