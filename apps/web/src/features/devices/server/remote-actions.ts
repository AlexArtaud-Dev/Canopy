'use server';

import { getJob } from '@canopy/contracts';

import { runAction, type ActionResult } from '@/shared/lib/action';
import { AppBaseError } from '@/shared/lib/errors';
import { requireSession } from '@/features/auth';
import { engineClientFor } from '@/features/files/server/engine-client';

import { controlInputSchema, rememberRunInputSchema } from '../devices.utils';
import { findRun, insertRun, listRuns, purgeRuns, type DeviceRun } from './devices-store';
import { catalogFor, declaredKind, entryOf, parse, startPluginCommand } from './plugin-runs';

/** The remote looks at the casts of the last day. */
const runsKeptMs = 24 * 60 * 60_000;

/**
 * Remembers a cast the person just started, so that the remote finds it: the run must be theirs
 * (the engine shows a person their own runs only) and a command of the plugin.
 */
export async function rememberRun(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const run = parse(rememberRunInputSchema, input);
    const session = await requireSession();
    const client = await engineClientFor(session);
    const { data: job } = await getJob({ client, path: { jobId: run.jobId } });
    if (job?.kind !== 'command' || !job.target?.startsWith(`${run.pluginId}.`)) {
      throw new AppBaseError('devices.not_found', 'no such run');
    }
    await insertRun(session.user.id, run);
    await purgeRuns(new Date(Date.now() - runsKeptMs));
    return null;
  });
}

/** The person's casts of the last day; the remote keeps those still running. */
export async function loadRuns(): Promise<ActionResult<DeviceRun[]>> {
  return runAction(async () => {
    const session = await requireSession();
    return listRuns(session.user.id, new Date(Date.now() - runsKeptMs));
  });
}

/**
 * Runs the plugin's control command on the device of one of the person's casts: the plugin
 * hands it to the running cast (a second session would cut the film on some screens).
 */
export async function sendControl(input: unknown): Promise<ActionResult<{ jobId: string }>> {
  return runAction(async () => {
    const control = parse(controlInputSchema, input);
    const session = await requireSession();
    const run = await findRun(session.user.id, control.jobId);
    if (!run) throw new AppBaseError('devices.not_found', 'no such cast');
    const client = await engineClientFor(session);
    const catalog = await catalogFor(client);
    const controls = declaredKind(catalog, run.pluginId, run.kind).controls;
    const id = controls?.[control.action];
    if (!id) throw new AppBaseError('devices.no_control', 'the plugin offers no such control');
    const entry = entryOf(catalog, id);
    const deviceField = entry.params.find((param) => param.device === run.kind);
    if (!deviceField) throw new AppBaseError('devices.no_control', 'control takes no device');
    const values: Record<string, string> = { [deviceField.name]: run.locator };
    if (control.action === 'seek' || control.action === 'volume') {
      const field = entry.params.find(
        (param) => param !== deviceField && param.required && param.type !== 'bool',
      );
      if (!field) throw new AppBaseError('devices.no_control', 'control takes no value');
      values[field.name] =
        control.action === 'seek' ? clock(control.seconds) : String(control.level);
    }
    const job = await startPluginCommand(client, run.pluginId, entry, values);
    return { jobId: job.id };
  });
}

/** `1:02:03`, as plugins read positions. */
function clock(seconds: number): string {
  const whole = Math.floor(seconds);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${Math.floor(whole / 3600)}:${pad(Math.floor((whole % 3600) / 60))}:${pad(whole % 60)}`;
}
