'use server';

import { z } from 'zod';

import {
  cancelJob as cancelEngineJob,
  listJobs,
  startFolderSize as startEngineFolderSize,
  type Job,
} from '@canopy/contracts';

import { runAction, type ActionResult } from '@/shared/lib/action';
import { AppBaseError } from '@/shared/lib/errors';
import { requireSession } from '@/features/auth';
import { cleanVirtualPath } from '@/features/files/files.utils';
import { engineClientFor } from '@/features/files/server/engine-client';

/** The engine authorizes and audits jobs; these actions only carry the signed-in person to it. */
async function client() {
  return engineClientFor(await requireSession());
}

function engineFailure(response: Response | undefined, error: { code: string } | undefined): never {
  if (!response) throw new AppBaseError('system.engine_unavailable', 'engine unreachable');
  throw new AppBaseError(error?.code ?? 'system.unexpected', 'engine refused the job request');
}

/** The person's recent jobs (every job for administrators), newest first. */
export async function listMyJobs(): Promise<ActionResult<Job[]>> {
  return runAction(async () => {
    const { data, error, response } = await listJobs({
      client: await client(),
      query: { limit: 50 },
    });
    if (!data) engineFailure(response, error);
    return data.items;
  });
}

const pathInput = z.object({ path: z.string().max(4096) });

export async function startFolderSize(input: unknown): Promise<ActionResult<Job>> {
  return runAction(async () => {
    const parsed = pathInput.safeParse(input);
    const path = parsed.success ? cleanVirtualPath(parsed.data.path) : null;
    if (path === null) throw new AppBaseError('files.invalid_path', 'invalid path');
    const { data, error, response } = await startEngineFolderSize({
      client: await client(),
      body: { path },
    });
    if (!data) engineFailure(response, error);
    return data;
  });
}

const jobInput = z.object({ jobId: z.uuid() });

export async function cancelJob(input: unknown): Promise<ActionResult<Job>> {
  return runAction(async () => {
    const parsed = jobInput.safeParse(input);
    if (!parsed.success) throw new AppBaseError('system.bad_request', 'invalid job id');
    const { data, error, response } = await cancelEngineJob({
      client: await client(),
      path: { jobId: parsed.data.jobId },
    });
    if (!data) engineFailure(response, error);
    return data;
  });
}
