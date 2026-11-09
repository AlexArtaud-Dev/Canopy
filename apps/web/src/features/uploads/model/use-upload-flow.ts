'use client';

import { useState } from 'react';

import { planUploads, topLevelName, type PickedFile, type UploadStrategy } from '../uploads.utils';
import { enqueueUploads } from './uploader';

export interface UploadConflict {
  source: string;
  target: string;
  sourceIsDirectory: boolean;
  targetIsDirectory: boolean;
  self: false;
}

/**
 * Starts uploads into a folder. Names already present are listed first so the person chooses
 * (skip, replace, keep both): nothing is replaced silently. `existing` maps names in the folder
 * to whether they are folders.
 */
export function useUploadFlow(folder: string, existing: ReadonlyMap<string, boolean>) {
  const [pending, setPending] = useState<PickedFile[] | null>(null);

  const conflictsOf = (files: readonly PickedFile[]): UploadConflict[] => {
    const seen = new Set<string>();
    return files.flatMap(({ file, relativeDir }) => {
      const top = topLevelName({ name: file.name, relativeDir });
      if (seen.has(top) || !existing.has(top)) return [];
      seen.add(top);
      return [
        {
          source: top,
          target: folder === '/' ? `/${top}` : `${folder}/${top}`,
          sourceIsDirectory: relativeDir !== '',
          targetIsDirectory: existing.get(top) === true,
          self: false,
        },
      ];
    });
  };

  const names = new Set(existing.keys());

  const start = (files: PickedFile[]) => {
    if (files.length === 0) return;
    if (conflictsOf(files).length > 0) {
      setPending(files);
      return;
    }
    enqueueUploads(folder, planUploads(files, names, {}, 'skip'));
  };

  const confirm = (choice: {
    strategy: UploadStrategy;
    decisions: Record<string, UploadStrategy>;
  }) => {
    if (!pending) return;
    // Decisions come keyed by target path; plans are keyed by top-level name.
    const byName: Record<string, UploadStrategy> = {};
    for (const [target, strategy] of Object.entries(choice.decisions)) {
      byName[target.slice(target.lastIndexOf('/') + 1)] = strategy;
    }
    enqueueUploads(folder, planUploads(pending, names, byName, choice.strategy));
    setPending(null);
  };

  return {
    start,
    conflicts: pending ? conflictsOf(pending) : [],
    confirm,
    cancel: () => {
      setPending(null);
    },
  };
}
