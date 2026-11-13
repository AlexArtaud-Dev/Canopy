'use server';

import { getJob, getJobLogs } from '@canopy/contracts';

import { runAction, type ActionResult } from '@/shared/lib/action';
import { AppBaseError } from '@/shared/lib/errors';
import { adminPermission } from '@/features/access/access.utils';
import { audit } from '@/features/audit/server/audit-writer';
import { authorize, requireSession } from '@/features/auth';
import { engineClientFor } from '@/features/files/server/engine-client';

import {
  addDeviceInputSchema,
  deviceIdInputSchema,
  deviceKindInputSchema,
  maxDevicesPerKind,
  parseDetected,
  updateDeviceInputSchema,
  type Device,
} from '../devices.utils';
import {
  countDevices,
  deleteDevice,
  findDevice,
  insertDevice,
  listDevices,
  recordDetected,
  updateDevice,
} from './devices-store';
import {
  catalogFor,
  declaredKind,
  entryOf,
  parse,
  startPluginCommand,
  type EngineClient,
} from './plugin-runs';

/** A detection longer than this is given up (the run goes on in Operations). */
const detectionLimitMs = 90_000;
const pollEveryMs = 500;

/** The devices kept for a plugin's kind. Anyone signed in reads them: they only fill forms. */
export async function loadDevices(input: unknown): Promise<ActionResult<Device[]>> {
  return runAction(async () => {
    const { pluginId, kind } = parse(deviceKindInputSchema, input);
    await requireSession();
    return listDevices(pluginId, kind);
  });
}

/** Every device kept, for the administration page. */
export async function loadAllDevices(): Promise<ActionResult<Device[]>> {
  return runAction(async () => {
    await authorize(adminPermission);
    return listDevices();
  });
}

async function waitForJob(client: EngineClient, jobId: string): Promise<boolean> {
  const deadline = Date.now() + detectionLimitMs;
  while (Date.now() < deadline) {
    const { data } = await getJob({ client, path: { jobId } });
    if (data && data.state !== 'queued' && data.state !== 'running')
      return data.state === 'succeeded';
    await new Promise((resolve) => setTimeout(resolve, pollEveryMs));
  }
  throw new AppBaseError('devices.detection_slow', 'detection still running');
}

/**
 * Runs the plugin's detection command as the caller (authorized and audited by the engine like
 * any run), reads its output here, on the server, and records what it found: nobody can slip a
 * device in from the browser. Its fields start with the values saved for the plugin.
 */
export async function detectDevices(input: unknown): Promise<ActionResult<Device[]>> {
  return runAction(async () => {
    const { pluginId, kind } = parse(deviceKindInputSchema, input);
    const session = await requireSession();
    const client = await engineClientFor(session);
    const catalog = await catalogFor(client);
    const declared = declaredKind(catalog, pluginId, kind);
    const started = await startPluginCommand(client, pluginId, entryOf(catalog, declared.detect));
    if (!(await waitForJob(client, started.id))) {
      throw new AppBaseError('devices.detection_failed', 'detection failed');
    }
    const logs = await getJobLogs({
      client,
      path: { jobId: started.id },
      query: { after: 0 },
    });
    const found = parseDetected((logs.data?.items ?? []).map((line) => line.line));
    const room = maxDevicesPerKind - (await countDevices(pluginId, kind));
    await recordDetected(pluginId, kind, found, room);
    return listDevices(pluginId, kind);
  });
}

/** Keeps a device given by its locator (administrators). */
export async function addDevice(input: unknown): Promise<ActionResult<Device[]>> {
  return runAction(async () => {
    const { pluginId, kind, locator, name } = parse(addDeviceInputSchema, input);
    const session = await authorize(adminPermission);
    declaredKind(await catalogFor(await engineClientFor(session)), pluginId, kind);
    if ((await countDevices(pluginId, kind)) >= maxDevicesPerKind) {
      throw new AppBaseError('devices.full', 'too many devices', {
        params: { max: maxDevicesPerKind },
      });
    }
    if (
      !(await insertDevice(
        pluginId,
        kind,
        locator,
        name === undefined || name === '' ? null : name,
      ))
    ) {
      throw new AppBaseError('devices.already_kept', 'device already kept');
    }
    await audit({
      action: 'devices.add',
      result: 'success',
      actorId: session.user.id,
      target: `${pluginId}/${kind}`,
      meta: { locator },
    });
    return listDevices(pluginId, kind);
  });
}

/** Names, hides or shows a kept device (administrators). */
export async function changeDevice(input: unknown): Promise<ActionResult<Device>> {
  return runAction(async () => {
    const { id, name, hidden } = parse(updateDeviceInputSchema, input);
    const session = await authorize(adminPermission);
    const device = await findDevice(id);
    if (!device) throw new AppBaseError('devices.not_found', 'no such device');
    const change = {
      ...(name === undefined ? {} : { customName: name === '' ? null : name }),
      ...(hidden === undefined ? {} : { hidden }),
    };
    await updateDevice(id, change);
    await audit({
      action: 'devices.update',
      result: 'success',
      actorId: session.user.id,
      target: `${device.pluginId}/${device.kind}`,
      meta: { locator: device.locator, ...change },
    });
    return { ...device, ...change };
  });
}

/** Forgets a device; detection finds it again if it is still on the network (administrators). */
export async function forgetDevice(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { id } = parse(deviceIdInputSchema, input);
    const session = await authorize(adminPermission);
    const device = await findDevice(id);
    if (!device) return null;
    await deleteDevice(id);
    await audit({
      action: 'devices.forget',
      result: 'success',
      actorId: session.user.id,
      target: `${device.pluginId}/${device.kind}`,
      meta: { locator: device.locator },
    });
    return null;
  });
}
