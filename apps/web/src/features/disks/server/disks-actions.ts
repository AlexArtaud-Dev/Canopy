'use server';

import { checkDisks, getDisks, startDiskSelfTest, type DiskReport } from '@canopy/contracts';

import { runAction, type ActionResult } from '@/shared/lib/action';
import { AppBaseError } from '@/shared/lib/errors';
import { requireSession } from '@/features/auth';
import { engineClientFor } from '@/features/files/server/engine-client';

import { selfTestInputSchema } from '../disks.utils';

/** The engine refused (its error code) or could not be reached. */
function refusal(response: Response | undefined, code: string): AppBaseError {
  if (!response) return new AppBaseError('system.engine_unavailable', 'engine unreachable');
  return new AppBaseError(code, 'disks request refused');
}

/** The latest reading of the disks (needs `metrics:disks`, checked by the engine). */
export async function readDisks(): Promise<ActionResult<DiskReport>> {
  return runAction(async () => {
    const client = await engineClientFor(await requireSession());
    const read = await getDisks({ client });
    if (read.data) return read.data;
    throw refusal(read.response, read.error.code);
  });
}

/** Reads the disks now, without waking sleeping ones (administrators; audited by the engine). */
export async function checkDisksNow(): Promise<ActionResult<DiskReport>> {
  return runAction(async () => {
    const client = await engineClientFor(await requireSession());
    const checked = await checkDisks({ client });
    if (checked.data) return checked.data;
    throw refusal(checked.response, checked.error.code);
  });
}

/** Starts a disk's self-test as a job (administrators; audited by the engine). */
export async function runDiskSelfTest(input: unknown): Promise<ActionResult<{ jobId: string }>> {
  return runAction(async () => {
    const parsed = selfTestInputSchema.safeParse(input);
    if (!parsed.success) throw new AppBaseError('system.bad_request', 'invalid self-test');
    const client = await engineClientFor(await requireSession());
    const started = await startDiskSelfTest({
      client,
      path: { disk: parsed.data.disk },
      body: { test: parsed.data.test },
    });
    if (started.data) return { jobId: started.data.id };
    throw refusal(started.response, started.error.code);
  });
}
