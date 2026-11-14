import 'server-only';

import { and, count, desc, eq, gte, lt, sql } from 'drizzle-orm';

import { getDb } from '@/shared/db/client';

import type { DetectedDevice, Device } from '../devices.utils';
import { defaultDevicesTable, deviceRunsTable, pluginDevicesTable } from './devices.schema';

const columns = {
  id: pluginDevicesTable.id,
  pluginId: pluginDevicesTable.pluginId,
  kind: pluginDevicesTable.kind,
  locator: pluginDevicesTable.locator,
  detectedName: pluginDevicesTable.detectedName,
  customName: pluginDevicesTable.customName,
  type: pluginDevicesTable.type,
  model: pluginDevicesTable.model,
  needsPairing: pluginDevicesTable.needsPairing,
  hidden: pluginDevicesTable.hidden,
  addedByHand: pluginDevicesTable.addedByHand,
  lastSeen: pluginDevicesTable.lastSeen,
};

type Row = Omit<Device, 'lastSeen'> & { lastSeen: Date | string | null };

function toDevice(row: Row): Device {
  const { lastSeen } = row;
  return {
    ...row,
    lastSeen: lastSeen === null ? null : new Date(lastSeen).toISOString(),
  };
}

/** The devices kept for a plugin's kind, or for every plugin when none is named. */
export async function listDevices(pluginId?: string, kind?: string): Promise<Device[]> {
  const filters = [
    ...(pluginId === undefined ? [] : [eq(pluginDevicesTable.pluginId, pluginId)]),
    ...(kind === undefined ? [] : [eq(pluginDevicesTable.kind, kind)]),
  ];
  const rows = await getDb()
    .select(columns)
    .from(pluginDevicesTable)
    .where(filters.length > 0 ? and(...filters) : undefined);
  return rows.map(toDevice);
}

export async function findDevice(id: string): Promise<Device | null> {
  const [row] = await getDb()
    .select(columns)
    .from(pluginDevicesTable)
    .where(eq(pluginDevicesTable.id, id));
  return row ? toDevice(row) : null;
}

export async function countDevices(pluginId: string, kind: string): Promise<number> {
  const [row] = await getDb()
    .select({ total: count() })
    .from(pluginDevicesTable)
    .where(and(eq(pluginDevicesTable.pluginId, pluginId), eq(pluginDevicesTable.kind, kind)));
  return row?.total ?? 0;
}

/**
 * Records what a detection found: new devices are added, known ones refreshed (announced name,
 * type, model, pairing, last seen). Names given by administrators and hidden flags stay.
 */
export async function recordDetected(
  pluginId: string,
  kind: string,
  found: readonly DetectedDevice[],
  room: number,
): Promise<void> {
  if (found.length === 0) return;
  const known = new Set((await listDevices(pluginId, kind)).map((device) => device.locator));
  // New devices only while there is room; known ones are always refreshed.
  let left = room;
  const kept = found.filter((device) => known.has(device.locator) || left-- > 0);
  if (kept.length === 0) return;
  const now = new Date();
  await getDb()
    .insert(pluginDevicesTable)
    .values(
      kept.map((device) => ({
        pluginId,
        kind,
        locator: device.locator,
        detectedName: device.label,
        type: device.attributes.type ?? null,
        model: device.attributes.model ?? null,
        needsPairing: device.attributes.pairing === 'needed',
        firstSeen: now,
        lastSeen: now,
      })),
    )
    .onConflictDoUpdate({
      target: [pluginDevicesTable.pluginId, pluginDevicesTable.kind, pluginDevicesTable.locator],
      set: {
        detectedName: sql`excluded.detected_name`,
        type: sql`excluded.type`,
        model: sql`excluded.model`,
        needsPairing: sql`excluded.needs_pairing`,
        lastSeen: sql`excluded.last_seen`,
        // A device added by hand is seen for the first time when detection finds it.
        firstSeen: sql`coalesce(${pluginDevicesTable.firstSeen}, excluded.first_seen)`,
      },
    });
}

/** Adds a device by its locator; false when it is already kept. */
export async function insertDevice(
  pluginId: string,
  kind: string,
  locator: string,
  name: string | null,
): Promise<boolean> {
  const inserted = await getDb()
    .insert(pluginDevicesTable)
    .values({
      pluginId,
      kind,
      locator,
      detectedName: name ?? locator,
      customName: name,
      addedByHand: true,
    })
    .onConflictDoNothing()
    .returning({ id: pluginDevicesTable.id });
  return inserted.length > 0;
}

export async function updateDevice(
  id: string,
  change: { customName?: string | null; hidden?: boolean; needsPairing?: boolean },
): Promise<void> {
  await getDb().update(pluginDevicesTable).set(change).where(eq(pluginDevicesTable.id, id));
}

export async function deleteDevice(id: string): Promise<void> {
  await getDb().delete(pluginDevicesTable).where(eq(pluginDevicesTable.id, id));
}

/** The device a person starts forms with for a plugin's kind, if any. */
export async function findDefaultDevice(
  userId: string,
  pluginId: string,
  kind: string,
): Promise<string | null> {
  const [row] = await getDb()
    .select({ deviceId: defaultDevicesTable.deviceId })
    .from(defaultDevicesTable)
    .where(
      and(
        eq(defaultDevicesTable.userId, userId),
        eq(defaultDevicesTable.pluginId, pluginId),
        eq(defaultDevicesTable.kind, kind),
      ),
    );
  return row?.deviceId ?? null;
}

/** Sets (or, with null, clears) a person's device for a plugin's kind. */
export async function saveDefaultDevice(
  userId: string,
  pluginId: string,
  kind: string,
  deviceId: string | null,
): Promise<void> {
  if (deviceId === null) {
    await getDb()
      .delete(defaultDevicesTable)
      .where(
        and(
          eq(defaultDevicesTable.userId, userId),
          eq(defaultDevicesTable.pluginId, pluginId),
          eq(defaultDevicesTable.kind, kind),
        ),
      );
    return;
  }
  await getDb()
    .insert(defaultDevicesTable)
    .values({ userId, pluginId, kind, deviceId })
    .onConflictDoUpdate({
      target: [defaultDevicesTable.userId, defaultDevicesTable.pluginId, defaultDevicesTable.kind],
      set: { deviceId },
    });
}

/** A cast started from Canopy, as the remote reads it. */
export interface DeviceRun {
  jobId: string;
  pluginId: string;
  kind: string;
  locator: string;
  file: string;
}

export async function insertRun(userId: string, run: DeviceRun): Promise<void> {
  await getDb()
    .insert(deviceRunsTable)
    .values({ userId, ...run })
    .onConflictDoNothing();
}

/** A person's casts started since `since`, the latest first. */
export async function listRuns(userId: string, since: Date): Promise<DeviceRun[]> {
  return getDb()
    .select({
      jobId: deviceRunsTable.jobId,
      pluginId: deviceRunsTable.pluginId,
      kind: deviceRunsTable.kind,
      locator: deviceRunsTable.locator,
      file: deviceRunsTable.file,
    })
    .from(deviceRunsTable)
    .where(and(eq(deviceRunsTable.userId, userId), gte(deviceRunsTable.createdAt, since)))
    .orderBy(desc(deviceRunsTable.createdAt))
    .limit(50);
}

export async function findRun(userId: string, jobId: string): Promise<DeviceRun | null> {
  const [run] = await getDb()
    .select({
      jobId: deviceRunsTable.jobId,
      pluginId: deviceRunsTable.pluginId,
      kind: deviceRunsTable.kind,
      locator: deviceRunsTable.locator,
      file: deviceRunsTable.file,
    })
    .from(deviceRunsTable)
    .where(and(eq(deviceRunsTable.userId, userId), eq(deviceRunsTable.jobId, jobId)));
  return run ?? null;
}

/** Forgets casts older than `before`: the remote only looks at the last day. */
export async function purgeRuns(before: Date): Promise<void> {
  await getDb().delete(deviceRunsTable).where(lt(deviceRunsTable.createdAt, before));
}
