'use server';

import { z } from 'zod';

import { getEntryProperties, type EntryProperties } from '@canopy/contracts';

import { runAction, type ActionResult } from '@/shared/lib/action';
import { AppBaseError } from '@/shared/lib/errors';
import { requireSession } from '@/features/auth';

import { engineClientFor } from './engine-client';

const inputSchema = z.object({ path: z.string().min(1).max(4096) });

/** Details of one entry for the Properties dialog. Reading changes nothing: not audited. */
export async function loadEntryProperties(input: unknown): Promise<ActionResult<EntryProperties>> {
  return runAction(async () => {
    const { path } = inputSchema.parse(input);
    const session = await requireSession();
    const { data, error, response } = await getEntryProperties({
      client: await engineClientFor(session),
      query: { path },
    });
    if (!response) throw new AppBaseError('system.engine_unavailable', 'engine unreachable');
    if (error) throw new AppBaseError(error.code, 'engine refused the properties');
    return data;
  });
}
