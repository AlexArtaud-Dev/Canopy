'use server';

import { getJob } from '@canopy/contracts';

import { runAction, type ActionResult } from '@/shared/lib/action';
import { AppBaseError } from '@/shared/lib/errors';
import { audit } from '@/features/audit/server/audit-writer';
import { requireSession } from '@/features/auth';
import { engineClientFor } from '@/features/files/server/engine-client';

import {
  confirmPairingInputSchema,
  pairingCodeInputSchema,
  deviceIdInputSchema,
  type Device,
} from '../devices.utils';
import { findDevice, updateDevice } from './devices-store';
import { catalogFor, declaredKind, entryOf, parse, startPluginCommand } from './plugin-runs';

async function pairingOf(deviceId: string) {
  const session = await requireSession();
  const device = await findDevice(deviceId);
  if (!device) throw new AppBaseError('devices.not_found', 'no such device');
  const client = await engineClientFor(session);
  const catalog = await catalogFor(client);
  const { pair } = declaredKind(catalog, device.pluginId, device.kind);
  if (!pair) throw new AppBaseError('devices.no_pairing', 'this kind pairs no device');
  return { session, device, client, catalog, pair };
}

/**
 * Starts the plugin's pairing of a device, as the caller: the device shows a code and the run
 * waits for it. Returns the run, which ends once the code is handed over.
 */
export async function startPairing(input: unknown): Promise<ActionResult<{ jobId: string }>> {
  return runAction(async () => {
    const { id } = parse(deviceIdInputSchema, input);
    const { device, client, catalog, pair } = await pairingOf(id);
    const entry = entryOf(catalog, pair.start);
    const field = entry.params.find((param) => param.device === device.kind);
    if (!field) throw new AppBaseError('devices.no_pairing', 'pairing takes no device');
    const job = await startPluginCommand(client, device.pluginId, entry, {
      [field.name]: device.locator,
    });
    return { jobId: job.id };
  });
}

/** Hands the code the device shows to the pairing that waits for it. */
export async function sendPairingCode(input: unknown): Promise<ActionResult<{ jobId: string }>> {
  return runAction(async () => {
    const { id, code } = parse(pairingCodeInputSchema, input);
    const { device, client, catalog, pair } = await pairingOf(id);
    const entry = entryOf(catalog, pair.code);
    const field = entry.params.find(
      (param) => param.type === 'string' && param.device === undefined,
    );
    if (!field) throw new AppBaseError('devices.no_pairing', 'pairing code takes no code');
    const job = await startPluginCommand(client, device.pluginId, entry, { [field.name]: code });
    return { jobId: job.id };
  });
}

/**
 * Marks a device paired once the caller's pairing run succeeded: the engine only shows a person
 * their own runs, and the run must be this kind's pairing command.
 */
export async function confirmPairing(input: unknown): Promise<ActionResult<Device>> {
  return runAction(async () => {
    const { id, jobId } = parse(confirmPairingInputSchema, input);
    const { session, device, client, pair } = await pairingOf(id);
    const { data: job } = await getJob({ client, path: { jobId } });
    if (job?.state !== 'succeeded' || job.target !== pair.start) {
      throw new AppBaseError('devices.pairing_failed', 'pairing did not succeed');
    }
    await updateDevice(id, { needsPairing: false });
    await audit({
      action: 'devices.pair',
      result: 'success',
      actorId: session.user.id,
      target: `${device.pluginId}/${device.kind}`,
      meta: { locator: device.locator },
    });
    return { ...device, needsPairing: false };
  });
}
