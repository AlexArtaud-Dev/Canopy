import { z } from 'zod';

import { cleanVirtualPath } from '@/features/files/files.utils';

const virtualPath = z
  .string()
  .max(4096)
  .refine((value) => cleanVirtualPath(value) === value);

export const pathsInputSchema = z.object({ paths: z.array(virtualPath).min(1).max(1000) });
export const idsInputSchema = z.object({
  ids: z.array(z.string().regex(/^[0-9a-f]{32,544}$/)).max(1000),
});

const dayMs = 24 * 60 * 60 * 1000;

/** Whole days before retention removes an item (0 on its last day). */
export function daysLeft(deletedAt: string, retentionDays: number, now: Date): number {
  const expires = Date.parse(deletedAt) + retentionDays * dayMs;
  return Math.max(0, Math.floor((expires - now.getTime()) / dayMs));
}

/** Parent folder of an original path, for "where it was". */
export function originalFolder(originalPath: string): string {
  const slash = originalPath.lastIndexOf('/');
  return slash <= 0 ? '/' : originalPath.slice(0, slash);
}
