import { z } from 'zod';

import { parentPath } from './browser.utils';
import { cleanVirtualPath, type PathAction } from './files.utils';

export const transferOperations = ['copy', 'move'] as const;
export type TransferOperation = (typeof transferOperations)[number];

export const conflictStrategies = ['skip', 'overwrite', 'keep_both'] as const;
export type ConflictStrategy = (typeof conflictStrategies)[number];

export interface TransferConflict {
  source: string;
  target: string;
  sourceIsDirectory: boolean;
  targetIsDirectory: boolean;
  /** Copy onto itself: only "keep both" applies. */
  self: boolean;
}

/** One path segment, as the engine accepts it (rename, new folder). */
export const entryNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine((name) => name !== '.' && name !== '..' && !/[/\\\p{Cc}]/u.test(name));

const virtualPathSchema = z
  .string()
  .max(4096)
  .refine((value) => cleanVirtualPath(value) === value);

export const transferInputSchema = z.object({
  operation: z.enum(transferOperations),
  sources: z.array(virtualPathSchema).min(1).max(1000),
  destination: virtualPathSchema,
});

export const transferJobInputSchema = transferInputSchema.extend({
  strategy: z.enum(conflictStrategies),
  decisions: z.record(z.string(), z.enum(conflictStrategies)).optional(),
});

export function childPath(folder: string, name: string): string {
  return folder === '/' ? `/${name}` : `${folder}/${name}`;
}

/** The menu acts on the whole selection when the clicked entry is part of it, else on that entry. */
export function operationTargets(selected: ReadonlySet<string>, clicked: string): string[] {
  return selected.has(clicked) ? [...selected] : [clicked];
}

/** Drag with Ctrl (Option on macOS) copies; a plain drag moves, as in desktop file managers. */
export function dropOperation(modifiers: {
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}): TransferOperation {
  return modifiers.ctrlKey || modifiers.altKey || modifiers.metaKey ? 'copy' : 'move';
}

/** Whether entries may be dropped into a folder: never into themselves, never a no-op move. */
export function canDropInto(
  sources: readonly string[],
  folder: string,
  operation: TransferOperation,
): boolean {
  if (sources.length === 0) return false;
  return sources.every((source) => {
    if (folder === source || folder.startsWith(`${source}/`)) return false;
    return operation === 'copy' || parentPath(source) !== folder;
  });
}

/**
 * The job request for the choices made in the conflict dialog: a general strategy plus decisions
 * only where an item differs from it. Copies onto themselves always keep both.
 */
export function transferDecisions(
  conflicts: readonly TransferConflict[],
  choices: Readonly<Record<string, ConflictStrategy>>,
  fallback: ConflictStrategy,
): { strategy: ConflictStrategy; decisions: Record<string, ConflictStrategy> } {
  const decisions: Record<string, ConflictStrategy> = {};
  for (const conflict of conflicts) {
    const choice = conflict.self ? 'keep_both' : (choices[conflict.target] ?? fallback);
    if (choice !== fallback) decisions[conflict.target] = choice;
  }
  return { strategy: fallback, decisions };
}

/** Which strategies make sense for a conflict (a file never replaces a folder, nor the reverse). */
export function strategiesFor(conflict: TransferConflict): ConflictStrategy[] {
  if (conflict.self) return ['keep_both'];
  if (conflict.sourceIsDirectory !== conflict.targetIsDirectory) return ['skip', 'keep_both'];
  return [...conflictStrategies];
}

/** Characters to preselect when renaming: the name without its extension. */
export function stemLength(name: string, isDirectory: boolean): number {
  if (isDirectory) return name.length;
  const dot = name.lastIndexOf('.');
  return dot > 0 ? dot : name.length;
}

/** Permission an operation needs on its sources. */
export function sourceAction(operation: TransferOperation): PathAction {
  return operation;
}

/** Gap between the pointer and the drag badge, so the badge never hides what is under it. */
export const dragBadgeGap = { x: 14, y: 10 };

/**
 * Moves the drag badge from the dragged row's corner to just beside the pointer: the overlay
 * starts at the row's top-left, so shift it by where the row was grabbed.
 */
export function pointerBadgeOffset(
  grab: { clientX: number; clientY: number } | null,
  rect: { left: number; top: number } | null,
): { x: number; y: number } {
  if (!grab || !rect) return { x: 0, y: 0 };
  return {
    x: grab.clientX - rect.left + dragBadgeGap.x,
    y: grab.clientY - rect.top + dragBadgeGap.y,
  };
}
