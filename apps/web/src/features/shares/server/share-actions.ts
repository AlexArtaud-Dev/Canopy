'use server';

import { statEntry } from '@canopy/contracts';

import { parseServerEnv } from '@/shared/config/env';
import { runAction, type ActionResult } from '@/shared/lib/action';
import { AppBaseError } from '@/shared/lib/errors';
import { openSecret, sealSecret } from '@/shared/secrets/secrets';
import { audit } from '@/features/audit/server/audit-writer';
import { permissionsOf, requireSession, type CurrentSession } from '@/features/auth';
import { hashPassword } from '@/features/auth/server/password';
import { engineClientFor } from '@/features/files/server/engine-client';
import { isMailConfigured } from '@/features/mail/mail.utils';
import { getMailSettings } from '@/features/mail/server/mailer';
import { cleanVirtualPath } from '@/features/files/files.utils';
import { getSettings } from '@/features/settings/server/settings-store';

import { sharesSettings } from '../shares.settings';
import {
  createShareSchema,
  expiryDate,
  megabytes,
  parseExtensions,
  shareIdSchema,
  shareLink,
  shareStatus,
  type ShareIdentity,
  type ShareKind,
  type ShareStatus,
} from '../shares.utils';
import {
  countDropOffs,
  deleteDropOff,
  findDropOff,
  listDropOffs,
  purgeDropOffs,
  type DropOffView,
} from './drop-offs';
import { findShare, insertShare, listShares, revokeShareRow, type ShareRow } from './share-store';
import { hashShareToken, newShareToken, tokenPurpose } from './share-tokens';

const managePermission = 'shares:manage';

/** One link as its owner (or an administrator) sees it. */
export interface ShareView {
  id: string;
  name: string;
  path: string;
  isDirectory: boolean;
  kind: ShareKind;
  ownerId: string;
  status: ShareStatus;
  /** ISO 8601. */
  expiresAt: string;
  createdAt: string;
  lastAccessAt: string | null;
  hasPassword: boolean;
  downloadCount: number;
  maxDownloads: number | null;
  /** Upload links: what was received, and the limit on files. */
  uploadedFiles: number;
  uploadedBytes: number;
  maxFiles: number | null;
  /** Upload links: what depositors give, and how many visits sent something. */
  identity: ShareIdentity;
  dropOffCount: number;
  /** Only for the person's own links: administrators manage others' links, they do not use them. */
  link: string | null;
}

function viewOf(share: ShareRow, viewerId: string, now: Date, dropOffCount = 0): ShareView {
  const origin = parseServerEnv(process.env).CANOPY_PUBLIC_URL;
  return {
    id: share.id,
    name: share.name,
    path: share.path,
    isDirectory: share.isDirectory,
    kind: share.kind,
    ownerId: share.ownerId,
    status: shareStatus(share, now),
    expiresAt: share.expiresAt.toISOString(),
    createdAt: share.createdAt.toISOString(),
    lastAccessAt: share.lastAccessAt?.toISOString() ?? null,
    hasPassword: share.passwordHash !== null,
    downloadCount: share.downloadCount,
    maxDownloads: share.maxDownloads,
    uploadedFiles: share.uploadedFiles,
    uploadedBytes: share.uploadedBytes,
    maxFiles: share.maxFiles,
    identity: share.identity,
    dropOffCount,
    link:
      share.ownerId === viewerId
        ? shareLink(origin, openSecret(share.tokenSealed, tokenPurpose))
        : null,
  };
}

function parse<T>(
  schema: { safeParse: (input: unknown) => { success: boolean; data?: T } },
  input: unknown,
): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success || parsed.data === undefined) {
    throw new AppBaseError('system.bad_request', 'invalid input');
  }
  return parsed.data;
}

/**
 * Creates a link to a file or folder. The engine decides whether the person may share it (the
 * `share` path action); the validity is capped by the administrator's maximum.
 */
export async function createShare(input: unknown): Promise<ActionResult<ShareView>> {
  return runAction(async () => {
    const session = await requireSession();
    const request = parse(createShareSchema, input);
    const path = cleanVirtualPath(request.path);
    if (path === null || path === '/') throw new AppBaseError('files.invalid_path', 'invalid path');
    const { values: settings } = await getSettings('shares', sharesSettings);
    if (request.expiresInDays > settings.maxExpiryDays) {
      throw new AppBaseError('shares.expiry_too_long', 'expiry past the maximum', {
        params: { days: settings.maxExpiryDays },
      });
    }
    if (settings.requirePassword && request.password === '') {
      throw new AppBaseError('shares.password_required', 'a password is required');
    }
    if (
      request.kind === 'upload' &&
      request.upload.identity === 'verified' &&
      !isMailConfigured(await getMailSettings())
    ) {
      throw new AppBaseError('shares.identity_needs_mail', 'codes need e-mail');
    }
    const {
      data: entry,
      error,
      response,
    } = await statEntry({
      client: await engineClientFor(session),
      query: { path },
    });
    if (!response) throw new AppBaseError('system.engine_unavailable', 'engine unreachable');
    if (!entry) throw new AppBaseError(error.code, 'engine refused');
    // An upload link sends files into a folder: its owner must be allowed to upload there too.
    const upload = request.kind === 'upload';
    const allowed =
      entry.actions.includes('share') &&
      (!upload || (entry.kind === 'directory' && entry.actions.includes('upload')));
    if (!allowed) {
      await audit({
        action: 'shares.create',
        result: 'denied',
        actorId: session.user.id,
        target: path,
      });
      throw new AppBaseError('files.forbidden', 'no share right on this path');
    }
    const token = newShareToken();
    const now = new Date();
    const share = await insertShare({
      tokenHash: hashShareToken(token),
      tokenSealed: sealSecret(token, tokenPurpose),
      ownerId: session.user.id,
      path,
      name: entry.name,
      isDirectory: entry.kind === 'directory',
      passwordHash: request.password === '' ? null : await hashPassword(request.password),
      expiresAt: expiryDate(request.expiresInDays, now),
      maxDownloads: upload ? null : request.maxDownloads,
      kind: request.kind,
      ...(upload
        ? {
            allowedExtensions: parseExtensions(request.upload.extensions),
            maxFileBytes: megabytes(request.upload.maxFileMb),
            maxTotalBytes: megabytes(request.upload.maxTotalMb),
            maxFiles: request.upload.maxFiles,
            identity: request.upload.identity,
          }
        : {}),
    });
    await audit({
      action: 'shares.create',
      result: 'success',
      actorId: session.user.id,
      target: path,
      meta: {
        share: share.id,
        expiresInDays: request.expiresInDays,
        password: request.password !== '',
        kind: request.kind,
        maxDownloads: upload ? null : request.maxDownloads,
        ...(upload ? { upload: request.upload } : {}),
      },
    });
    return viewOf(share, session.user.id, now);
  });
}

export interface ShareOptions {
  defaultExpiryDays: number;
  maxExpiryDays: number;
  requirePassword: boolean;
  /** E-mail is set up: upload links may verify depositors with a code. */
  mailReady: boolean;
}

/** The administrator's rules for new links, for the share dialog. */
export async function loadShareOptions(): Promise<ActionResult<ShareOptions>> {
  return runAction(async () => {
    await requireSession();
    const [{ values }, mail] = await Promise.all([
      getSettings('shares', sharesSettings),
      getMailSettings(),
    ]);
    return {
      defaultExpiryDays: values.defaultExpiryDays,
      maxExpiryDays: values.maxExpiryDays,
      requirePassword: values.requirePassword,
      mailReady: isMailConfigured(mail),
    };
  });
}

/** Forgets drop-offs past the retention administrators set (names and e-mails are personal). */
async function purgeOldDropOffs(now: Date): Promise<void> {
  const { values } = await getSettings('shares', sharesSettings);
  await purgeDropOffs(new Date(now.getTime() - values.dropOffRetentionDays * 86_400_000));
}

/** The person's links, or everyone's when `all` is asked by someone who manages links. */
export async function loadShares(input: { all: boolean }): Promise<ActionResult<ShareView[]>> {
  return runAction(async () => {
    const session = await requireSession();
    const all = input.all && permissionsOf(session.user).includes(managePermission);
    const now = new Date();
    await purgeOldDropOffs(now);
    const rows = await listShares(all ? null : session.user.id);
    const counts = await countDropOffs(
      rows.filter((row) => row.kind === 'upload').map((row) => row.id),
    );
    return rows.map((row) => viewOf(row, session.user.id, now, counts.get(row.id) ?? 0));
  });
}

function mayManage(session: CurrentSession, share: ShareRow): boolean {
  return (
    share.ownerId === session.user.id || permissionsOf(session.user).includes(managePermission)
  );
}

/** Stops a link at once. Its owner, or someone who manages links, may do it. */
export async function revokeShare(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const session = await requireSession();
    const { id } = parse(shareIdSchema, input);
    const share = await findShare(id);
    if (!share) throw new AppBaseError('shares.not_found', 'no such share');
    if (!mayManage(session, share)) {
      await audit({
        action: 'shares.revoke',
        result: 'denied',
        actorId: session.user.id,
        target: share.path,
      });
      throw new AppBaseError('auth.forbidden', 'not the owner');
    }
    await revokeShareRow(id);
    await audit({
      action: 'shares.revoke',
      result: 'success',
      actorId: session.user.id,
      target: share.path,
      meta: { share: id, owner: share.ownerId },
    });
    return null;
  });
}

/** Who sent files through an upload link, and what: for its owner or someone who manages links. */
export async function loadDropOffs(input: unknown): Promise<ActionResult<DropOffView[]>> {
  return runAction(async () => {
    const session = await requireSession();
    const { id } = parse(shareIdSchema, input);
    const share = await findShare(id);
    if (!share) throw new AppBaseError('shares.not_found', 'no such share');
    if (!mayManage(session, share)) throw new AppBaseError('auth.forbidden', 'not the owner');
    await purgeOldDropOffs(new Date());
    return listDropOffs(id);
  });
}

/** Erases one drop-off's record (a depositor asked, or it is no longer needed); files stay. */
export async function eraseDropOff(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const session = await requireSession();
    const { id } = parse(shareIdSchema, input);
    const dropOff = await findDropOff(id);
    if (!dropOff) return null;
    const share = await findShare(dropOff.shareId);
    if (!share || !mayManage(session, share)) {
      throw new AppBaseError('auth.forbidden', 'not the owner');
    }
    await deleteDropOff(id);
    await audit({
      action: 'shares.drop_off_erase',
      result: 'success',
      actorId: session.user.id,
      target: share.path,
      meta: { share: share.id, dropOff: id },
    });
    return null;
  });
}
