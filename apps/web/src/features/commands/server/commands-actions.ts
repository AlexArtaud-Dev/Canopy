'use server';

import { z } from 'zod';

import {
  getJobLogs,
  listCommands,
  previewCommand as previewEngineCommand,
  startCommand as startEngineCommand,
  type CommandCatalog,
  type CommandPreview,
  type Job,
  type JobLogLine,
} from '@canopy/contracts';

import { runAction, type ActionResult } from '@/shared/lib/action';
import { AppBaseError } from '@/shared/lib/errors';
import { requireSession } from '@/features/auth';
import { engineClientFor } from '@/features/files/server/engine-client';
import { assertDevicesAllowed } from '@/features/devices/server/device-access';

/** The engine decides what is visible, validates the values and checks path rights. */
async function client() {
  return engineClientFor(await requireSession());
}

function refused(response: Response | undefined, error: { code: string } | undefined): never {
  if (!response) throw new AppBaseError('system.engine_unavailable', 'engine unreachable');
  throw new AppBaseError(error?.code ?? 'system.unexpected', 'engine refused the command');
}

const requestSchema = z.object({
  entry: z.string().min(1).max(128),
  params: z.record(z.string().max(64), z.union([z.string().max(4096), z.number(), z.boolean()])),
  dryRun: z.boolean().default(false),
});

function parse(input: unknown) {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) throw new AppBaseError('system.bad_request', 'invalid input');
  return parsed.data;
}

export async function loadCommands(): Promise<ActionResult<CommandCatalog>> {
  return runAction(async () => {
    const { data, error, response } = await listCommands({ client: await client() });
    if (!data) refused(response, error);
    return data;
  });
}

/** The exact arguments a run would use (secrets hidden); nothing runs. */
export async function previewCommand(input: unknown): Promise<ActionResult<CommandPreview>> {
  return runAction(async () => {
    const body = parse(input);
    const { data, error, response } = await previewEngineCommand({ client: await client(), body });
    if (!data) refused(response, error);
    return data;
  });
}

export async function startCommand(input: unknown): Promise<ActionResult<Job>> {
  return runAction(async () => {
    const body = parse(input);
    const engine = await client();
    // The engine knows nothing of who may use which device: checked here, before it runs.
    const { data: catalog } = await listCommands({ client: engine });
    const entry = catalog?.entries.find((candidate) => candidate.id === body.entry);
    if (entry) await assertDevicesAllowed(entry, body.params);
    const { data, error, response } = await startEngineCommand({ client: engine, body });
    if (!data) refused(response, error);
    return data;
  });
}

const logsSchema = z.object({ jobId: z.uuid(), after: z.number().int().min(0) });

/** Output lines of a run after `after` (the engine checks the job is the person's). */
export async function loadJobLogs(input: unknown): Promise<ActionResult<JobLogLine[]>> {
  return runAction(async () => {
    const parsed = logsSchema.safeParse(input);
    if (!parsed.success) throw new AppBaseError('system.bad_request', 'invalid input');
    const { data, error, response } = await getJobLogs({
      client: await client(),
      path: { jobId: parsed.data.jobId },
      query: { after: parsed.data.after },
    });
    if (!data) refused(response, error);
    return data.items;
  });
}
