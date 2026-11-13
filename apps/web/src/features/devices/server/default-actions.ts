'use server';

import { runAction, type ActionResult } from '@/shared/lib/action';
import { AppBaseError } from '@/shared/lib/errors';
import { audit } from '@/features/audit/server/audit-writer';
import { requireSession } from '@/features/auth';

import { defaultDeviceInputSchema, deviceKindInputSchema } from '../devices.utils';
import { findDefaultDevice, findDevice, saveDefaultDevice } from './devices-store';
import { parse } from './plugin-runs';

/** The device the signed-in person starts forms with for a plugin's kind, if any. */
export async function loadDefaultDevice(input: unknown): Promise<ActionResult<string | null>> {
  return runAction(async () => {
    const { pluginId, kind } = parse(deviceKindInputSchema, input);
    const session = await requireSession();
    return findDefaultDevice(session.user.id, pluginId, kind);
  });
}

/** Makes a kept device the person's own default for its kind, or clears it (`id` null). */
export async function setDefaultDevice(input: unknown): Promise<ActionResult<string | null>> {
  return runAction(async () => {
    const { pluginId, kind, id } = parse(defaultDeviceInputSchema, input);
    const session = await requireSession();
    if (id !== null) {
      const device = await findDevice(id);
      if (device?.pluginId !== pluginId || device.kind !== kind || device.hidden) {
        throw new AppBaseError('devices.not_found', 'no such device for this kind');
      }
    }
    await saveDefaultDevice(session.user.id, pluginId, kind, id);
    await audit({
      action: 'devices.default_set',
      result: 'success',
      actorId: session.user.id,
      target: `${pluginId}/${kind}`,
      meta: { device: id },
    });
    return id;
  });
}
