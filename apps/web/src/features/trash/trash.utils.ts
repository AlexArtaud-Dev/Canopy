import type { DeletePlan } from '@canopy/contracts';
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

export type DeleteDialog =
  | { kind: 'none' }
  | { kind: 'trash'; paths: string[]; plan: DeletePlan }
  /** Asked with Shift+Delete, or the selection does not fit the trash limits. */
  | { kind: 'permanent'; paths: string[]; plan: DeletePlan; asked: boolean }
  /** Too big for the trash, and the person may not delete for good. */
  | { kind: 'blocked'; paths: string[]; plan: DeletePlan };

/**
 * What deleting a measured selection asks: the trash when it fits (and permanent deletion was not
 * asked for, or may not be done), else a permanent delete for those who may purge, else nothing.
 */
export function deleteDialogFor(
  paths: string[],
  plan: DeletePlan,
  asked: boolean,
  mayPurge: boolean,
): DeleteDialog {
  if (mayPurge && (asked || !plan.fitsTrash)) return { kind: 'permanent', paths, plan, asked };
  if (plan.fitsTrash) return { kind: 'trash', paths, plan };
  return { kind: 'blocked', paths, plan };
}
