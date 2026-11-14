import { z } from 'zod';

import { cleanVirtualPath } from '@/features/files/files.utils';

/** Tokens are 32 random bytes in base64url: 43 characters, nothing else. */
export const shareTokenPattern = /^[A-Za-z0-9_-]{43}$/;

export type ShareStatus = 'active' | 'expired' | 'revoked' | 'exhausted';

export type ShareKind = 'download' | 'upload';

export interface ShareLimits {
  kind: ShareKind;
  expiresAt: Date;
  revokedAt: Date | null;
  maxDownloads: number | null;
  downloadCount: number;
  maxFiles: number | null;
  uploadedFiles: number;
}

/** Whether a link still works, and if not, why (shown to its visitors and its owner). */
export function shareStatus(share: ShareLimits, now: Date): ShareStatus {
  if (share.revokedAt) return 'revoked';
  if (share.expiresAt.getTime() <= now.getTime()) return 'expired';
  const [limit, used] =
    share.kind === 'upload'
      ? [share.maxFiles, share.uploadedFiles]
      : [share.maxDownloads, share.downloadCount];
  if (limit !== null && used >= limit) return 'exhausted';
  return 'active';
}

/**
 * What an upload link asks of depositors before they send anything: nothing, a name and an
 * e-mail they declare, or an e-mail they prove with a code sent to it.
 */
export const shareIdentities = ['none', 'declared', 'verified'] as const;
export type ShareIdentity = (typeof shareIdentities)[number];

/** Digits of the code proving a depositor's e-mail. */
export const dropOffCodeLength = 6;
/** How long that code works. */
export const dropOffCodeTtlMs = 15 * 60_000;
/** Wrong codes allowed before the depositor must ask for a new one. */
export const dropOffCodeAttempts = 5;

export const depositorSchema = z.object({
  token: z.string().max(64),
  name: z.string().trim().min(1).max(120),
  email: z.email().max(254),
});

export const dropOffCodeSchema = z.object({
  token: z.string().max(64),
  code: z.string().regex(new RegExp(`^[0-9]{${String(dropOffCodeLength)}}$`)),
});

/** A depositor as the visit knows them (none yet for a link asking nothing). */
export interface DropOffState {
  name: string | null;
  email: string | null;
  verified: boolean;
  /** A code was sent and not typed yet. */
  codePending: boolean;
}

/** What stands between a visitor and sending files through the link. */
export type DropOffStep = 'identity' | 'code' | 'ready';

export function dropOffStep(identity: ShareIdentity, dropOff: DropOffState | null): DropOffStep {
  if (identity === 'none') return 'ready';
  if (!dropOff?.email) return 'identity';
  if (identity === 'declared' || dropOff.verified) return 'ready';
  return dropOff.codePending ? 'code' : 'identity';
}

/** Why a typed code is refused, or null when it is the right one in time. */
export function codeRefusal(
  pending: { codeExpiresAt: Date | null; codeAttempts: number },
  matches: boolean,
  now: Date,
): 'shares.code_expired' | 'shares.code_invalid' | null {
  if (
    pending.codeExpiresAt === null ||
    pending.codeExpiresAt <= now ||
    pending.codeAttempts >= dropOffCodeAttempts
  ) {
    return 'shares.code_expired';
  }
  return matches ? null : 'shares.code_invalid';
}

/** What an upload link accepts (null: no limit). */
export interface UploadRules {
  /** Lowercase extensions without the dot; null accepts any type. */
  allowedExtensions: readonly string[] | null;
  maxFileBytes: number | null;
  maxTotalBytes: number | null;
  maxFiles: number | null;
}

export interface UploadUsage {
  uploadedBytes: number;
  uploadedFiles: number;
}

export type UploadRefusal =
  | 'shares.type_not_allowed'
  | 'shares.file_too_large'
  | 'shares.total_exceeded'
  | 'shares.files_exceeded';

const megabyte = 1024 * 1024;

/** "pdf, .JPG; png" → ["pdf", "jpg", "png"]; nothing typed means any type. */
export function parseExtensions(typed: string): string[] | null {
  const extensions = typed
    .split(/[\s,;]+/)
    .map((part) => part.trim().replace(/^\.+/, '').toLowerCase())
    .filter((part) => /^[a-z0-9][a-z0-9.+-]{0,15}$/.test(part));
  return extensions.length > 0 ? [...new Set(extensions)] : null;
}

/** A file name's extension, lowercase ("archive.tar.gz" → "gz"; none → ""). */
export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/**
 * Whether one more file fits an upload link, before it starts. The server checks again when it
 * reserves the file's place, atomically.
 */
export function uploadRefusal(
  rules: UploadRules,
  usage: UploadUsage,
  file: { name: string; size: number },
): UploadRefusal | null {
  const extension = extensionOf(file.name);
  if (rules.allowedExtensions !== null && !rules.allowedExtensions.includes(extension)) {
    return 'shares.type_not_allowed';
  }
  if (rules.maxFileBytes !== null && file.size > rules.maxFileBytes) return 'shares.file_too_large';
  if (rules.maxFiles !== null && usage.uploadedFiles >= rules.maxFiles)
    return 'shares.files_exceeded';
  if (rules.maxTotalBytes !== null && usage.uploadedBytes + file.size > rules.maxTotalBytes) {
    return 'shares.total_exceeded';
  }
  return null;
}

/** Megabytes typed by a person → bytes (null stays "no limit"). */
export function megabytes(value: number | null): number | null {
  return value === null ? null : value * megabyte;
}

const expiryChoices = [1, 7, 30, 90, 365] as const;

/** Validity choices up to the administrator's maximum (which is always offered). */
export function expiryOptions(maxDays: number): number[] {
  const options = expiryChoices.filter((days) => days < maxDays);
  return [...options, maxDays];
}

/** The default validity, never past the maximum. */
export function defaultExpiry(defaultDays: number, maxDays: number): number {
  return Math.min(defaultDays, maxDays);
}

export function expiryDate(days: number, now: Date): Date {
  return new Date(now.getTime() + days * 86_400_000);
}

export const sharePasswordMaxLength = 200;

export const createShareSchema = z.object({
  path: z.string().max(4096),
  expiresInDays: z.number().int().min(1).max(3650),
  /** Empty means no password. */
  password: z.string().max(sharePasswordMaxLength).default(''),
  maxDownloads: z.number().int().min(1).max(1_000_000).nullable().default(null),
  kind: z.enum(['download', 'upload']).default('download'),
  /** Upload links only. */
  upload: z
    .object({
      extensions: z.string().max(500).default(''),
      maxFileMb: z.number().int().min(1).max(10_000_000).nullable().default(null),
      maxTotalMb: z.number().int().min(1).max(10_000_000).nullable().default(null),
      maxFiles: z.number().int().min(1).max(1_000_000).nullable().default(null),
      identity: z.enum(shareIdentities).default('none'),
      notifyByEmail: z.boolean().default(false),
    })
    .default({
      extensions: '',
      maxFileMb: null,
      maxTotalMb: null,
      maxFiles: null,
      identity: 'none',
      notifyByEmail: false,
    }),
});
export type CreateShareInput = z.infer<typeof createShareSchema>;

export const shareIdSchema = z.object({ id: z.uuid() });

export const tokenSchema = z.string().regex(shareTokenPattern);

/** A path inside a shared folder, as visitors see it ("/" is the shared folder itself). */
export const sharedPathSchema = z.string().max(4096).default('/');

/**
 * The real path for a path relative to the shared folder, or null when it is invalid or leaves
 * the share. The engine confines share tokens too; this keeps bad links from reaching it.
 */
export function resolveShared(root: string, relative: string): string | null {
  const clean = cleanVirtualPath(relative.startsWith('/') ? relative : `/${relative}`);
  if (clean === null) return null;
  if (clean === '/') return root;
  return root === '/' ? clean : `${root}${clean}`;
}

/** The visitor's view of a real path inside the share ("/" for the shared folder). */
export function relativeShared(root: string, path: string): string {
  if (path === root) return '/';
  return root === '/' ? path : path.slice(root.length);
}

/** Crumbs from the shared folder down to a relative path. */
export function sharedCrumbs(relative: string): { name: string; path: string }[] {
  const parts = relative.split('/').filter(Boolean);
  return parts.map((name, index) => ({ name, path: `/${parts.slice(0, index + 1).join('/')}` }));
}

export function shareLink(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}/s/${token}`;
}

/** A drop-off is over once nothing arrived for this long: its owner gets one e-mail, not one per file. */
export const dropOffQuietMs = 2 * 60_000;

/** File names an owner's e-mail lists; the count stays exact beyond. */
export const dropOffEmailFileLimit = 20;

/**
 * Whether the owner should be e-mailed about a drop-off now: files they were not told about yet,
 * and the depositor done (nothing new for a while).
 */
export function dropOffEmailDue(
  dropOff: { fileCount: number; emailedFileCount: number; lastUploadAt: Date | null },
  now: Date,
): boolean {
  return (
    dropOff.fileCount > dropOff.emailedFileCount &&
    dropOff.lastUploadAt !== null &&
    now.getTime() - dropOff.lastUploadAt.getTime() >= dropOffQuietMs
  );
}
