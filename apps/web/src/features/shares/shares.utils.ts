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
    })
    .default({ extensions: '', maxFileMb: null, maxTotalMb: null, maxFiles: null }),
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
