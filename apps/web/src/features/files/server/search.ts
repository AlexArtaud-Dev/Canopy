'use server';

import { z } from 'zod';

import { searchFiles } from '@canopy/contracts';

import { runAction, type ActionResult } from '@/shared/lib/action';
import { AppBaseError } from '@/shared/lib/errors';
import { requireSession } from '@/features/auth';

import { browserQuerySchema, searchMinLength, toBrowserEntry } from '../browser.utils';
import type { BrowserEntry } from './browse';
import { engineClientFor } from './engine-client';

export interface SearchPage {
  entries: BrowserEntry[];
  /** Why the engine stopped early (too many results or entries, out of time), if it did. */
  truncated: 'results' | 'visited' | 'timeout' | null;
}

const searchInputSchema = browserQuerySchema
  .pick({ path: true })
  .extend({ q: z.string().trim().min(searchMinLength).max(200) });

/**
 * Names matching every word under a folder, as the signed-in user may see them. Reading names
 * changes nothing, so it is not audited; the engine walks only where the person may go.
 */
export async function searchFolder(input: unknown): Promise<ActionResult<SearchPage>> {
  return runAction(async () => {
    const parsed = searchInputSchema.safeParse(input);
    if (!parsed.success) throw new AppBaseError('files.invalid_query', 'invalid search');
    const session = await requireSession();
    const { data, error, response } = await searchFiles({
      client: await engineClientFor(session),
      query: { path: parsed.data.path, q: parsed.data.q },
    });
    if (!response) throw new AppBaseError('system.engine_unavailable', 'engine unreachable');
    if (error) throw new AppBaseError(error.code, 'engine refused the search');
    return { entries: data.entries.map(toBrowserEntry), truncated: data.truncated ?? null };
  });
}
