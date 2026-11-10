'use server';

import { z } from 'zod';

import { getMediaInfo, type MediaInfo } from '@canopy/contracts';

import { runAction, type ActionResult } from '@/shared/lib/action';
import { AppBaseError } from '@/shared/lib/errors';
import { requireSession } from '@/features/auth';

import { engineClientFor } from './engine-client';

const inputSchema = z.object({ path: z.string().min(1).max(4096) });

/**
 * How a video plays: as stored, or converted by the engine. Reading changes nothing; the
 * conversion itself is audited by the engine when it starts.
 */
export async function loadMediaInfo(input: unknown): Promise<ActionResult<MediaInfo>> {
  return runAction(async () => {
    const { path } = inputSchema.parse(input);
    const session = await requireSession();
    const { data, error, response } = await getMediaInfo({
      client: await engineClientFor(session),
      query: { path },
    });
    if (!response) throw new AppBaseError('system.engine_unavailable', 'engine unreachable');
    if (error) throw new AppBaseError(error.code, 'engine refused the media info');
    return data;
  });
}
