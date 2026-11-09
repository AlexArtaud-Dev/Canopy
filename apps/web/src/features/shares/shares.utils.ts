import { z } from 'zod';

import { cleanVirtualPath } from '@/features/files/files.utils';

/** Tokens are 32 random bytes in base64url: 43 characters, nothing else. */
export const shareTokenPattern = /^[A-Za-z0-9_-]{43}$/;

export type ShareStatus = 'active' | 'expired' | 'revoked' | 'exhausted';

export interface ShareLimits {
  expiresAt: Date;
  revokedAt: Date | null;
  maxDownloads: number | null;
  downloadCount: number;
}

/** Whether a link still works, and if not, why (shown to its visitors and its owner). */
export function shareStatus(share: ShareLimits, now: Date): ShareStatus {
  if (share.revokedAt) return 'revoked';
  if (share.expiresAt.getTime() <= now.getTime()) return 'expired';
  if (share.maxDownloads !== null && share.downloadCount >= share.maxDownloads) return 'exhausted';
  return 'active';
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
