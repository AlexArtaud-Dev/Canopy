'use server';

import { z } from 'zod';

import { listDirectory } from '@canopy/contracts';

import { runAction, type ActionResult } from '@/shared/lib/action';
import { AppBaseError } from '@/shared/lib/errors';
import { requireSession } from '@/features/auth';

import { browserPageSize, browserQuerySchema } from '../browser.utils';
import type { PathAction } from '../files.utils';
import { engineClientFor } from './engine-client';

export interface BrowserEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  /** ISO 8601. */
  modified: string;
  actions: PathAction[];
}

export interface FolderPage {
  path: string;
  /** Entries visible to the caller in the whole folder (pages stream in). */
  total: number;
  /** What the caller may do in the folder itself. */
  actions: PathAction[];
  offset: number;
  entries: BrowserEntry[];
}

const listInputSchema = browserQuerySchema.extend({
  offset: z.number().int().min(0).max(10_000_000).catch(0),
});

/**
 * One page of a folder, as the signed-in user sees it. Reading changes nothing, so it is not
 * audited; the engine enforces path grants (hidden entries never leave it).
 */
export async function listFolder(input: unknown): Promise<ActionResult<FolderPage>> {
  return runAction(async () => {
    const query = listInputSchema.parse(input);
    const session = await requireSession();
    const { data, error, response } = await listDirectory({
      client: await engineClientFor(session),
      query: {
        path: query.path,
        sort: query.sort,
        order: query.order,
        offset: query.offset,
        limit: browserPageSize,
      },
    });
    if (!response) throw new AppBaseError('system.engine_unavailable', 'engine unreachable');
    if (error) throw new AppBaseError(error.code, 'engine refused the listing');
    return {
      path: data.path,
      total: data.total,
      actions: data.actions,
      offset: query.offset,
      entries: data.entries.map((entry) => ({
        name: entry.name,
        path: entry.path,
        isDirectory: entry.kind === 'directory',
        size: entry.size,
        modified: entry.modified,
        actions: entry.actions,
      })),
    };
  });
}
