import 'server-only';

import type { CommandEntry } from '@canopy/contracts';

import { AppBaseError } from '@/shared/lib/errors';
import { audit } from '@/features/audit/server/audit-writer';
import { requireSession, type CurrentSession } from '@/features/auth';

import { namedDevices, refusedDevice, type DeviceUser } from '../devices.utils';
import { listDevices, listMemberGroupIds } from './devices-store';

/** What decides the devices a person may use: being an administrator, then their groups. */
export async function deviceUserOf(session: CurrentSession): Promise<DeviceUser> {
  if (session.user.isAdmin) return { isAdmin: true, groupIds: new Set() };
  return { isAdmin: false, groupIds: await listMemberGroupIds(session.user.id) };
}

/**
 * Refuses a run naming a device the person may not use. Every run of a command goes through
 * here before the engine (forms, remote, pairing), so a picker hiding a device is never what
 * keeps someone from casting to it.
 */
export async function assertDevicesAllowed(
  entry: CommandEntry,
  values: Readonly<Record<string, string | number | boolean>>,
): Promise<void> {
  const pluginId = entry.plugin?.id;
  const named = namedDevices(entry, values);
  if (pluginId === undefined || named.length === 0) return;
  const session = await requireSession();
  if (session.user.isAdmin) return;
  const refused = refusedDevice(named, await listDevices(pluginId), await deviceUserOf(session));
  if (!refused) return;
  await audit({
    action: 'devices.access_denied',
    result: 'denied',
    actorId: session.user.id,
    target: `${pluginId}/${refused.kind}`,
    meta: { locator: refused.locator, command: entry.id },
  });
  throw new AppBaseError('devices.forbidden', 'device not allowed');
}
