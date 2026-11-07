import 'server-only';

import { and, eq } from 'drizzle-orm';
import type { z } from 'zod';

import { getConnection, getDb } from '@/shared/db/client';
import { logger } from '@/shared/lib/logger';
import type { SettingsDefinition } from '@/shared/modules/settings.types';
import { audit } from '@/features/audit/server/audit-writer';
import { openSecret, sealSecret } from '@/shared/secrets/secrets';

import {
  resolveSettings,
  validateSettingUpdate,
  type ResolvedSettings,
  type StoredSetting,
} from '../settings.utils';
import { settingsTable } from './settings.schema';

const notifyChannel = 'canopy_settings';
const log = logger.child({ module: 'settings' });

/** Per-process cache of stored rows; every instance drops a module's entry on NOTIFY. */
const cache = new Map<string, Promise<StoredSetting[]>>();
let listening: Promise<unknown> | undefined;

function purposeOf(moduleId: string, key: string): string {
  return `settings:${moduleId}.${key}`;
}

function isSealed(value: unknown): value is { sealed: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'sealed' in value &&
    typeof value.sealed === 'string'
  );
}

function ensureListening(): void {
  listening ??= getConnection()
    .sql.listen(notifyChannel, (moduleId) => cache.delete(moduleId))
    .catch((error: unknown) => {
      // Without LISTEN the cache could go stale: stop caching rather than serve old values.
      log.error('settings LISTEN failed; caching disabled', { error });
      listening = undefined;
    });
}

async function loadStored(
  moduleId: string,
  definition: SettingsDefinition,
): Promise<StoredSetting[]> {
  const rows = await getDb()
    .select({ key: settingsTable.key, value: settingsTable.value })
    .from(settingsTable)
    .where(eq(settingsTable.module, moduleId));
  return rows.map((row) => ({
    key: row.key,
    value:
      definition.fields[row.key]?.sensitive && isSealed(row.value)
        ? (JSON.parse(openSecret(row.value.sealed, purposeOf(moduleId, row.key))) as unknown)
        : row.value,
  }));
}

/** Typed settings of one module: defaults ← stored values ← environment overrides. */
export async function getSettings<T extends z.ZodRawShape>(
  moduleId: string,
  definition: SettingsDefinition<T>,
): Promise<ResolvedSettings<z.infer<z.ZodObject<T>>>> {
  ensureListening();
  let stored = cache.get(moduleId);
  if (!stored) {
    stored = loadStored(moduleId, definition);
    if (listening) cache.set(moduleId, stored);
    stored.catch(() => cache.delete(moduleId));
  }
  const resolved = resolveSettings(definition, await stored, process.env);
  if (resolved.invalid.length > 0) {
    log.warn('ignoring invalid settings, defaults used', {
      settingsModule: moduleId,
      keys: resolved.invalid,
    });
  }
  return resolved;
}

/** Validates, stores (encrypting sensitive fields) and broadcasts one change. */
export async function updateSetting<T extends z.ZodRawShape>(
  moduleId: string,
  definition: SettingsDefinition<T>,
  key: string,
  value: unknown,
  actorId: string | null,
): Promise<void> {
  const parsed = validateSettingUpdate(definition, key, value, process.env);
  const stored = definition.fields[key]?.sensitive
    ? { sealed: sealSecret(JSON.stringify(parsed), purposeOf(moduleId, key)) }
    : parsed;
  await getDb()
    .insert(settingsTable)
    .values({ module: moduleId, key, value: stored, updatedBy: actorId })
    .onConflictDoUpdate({
      target: [settingsTable.module, settingsTable.key],
      set: { value: stored, updatedBy: actorId, updatedAt: new Date() },
    });
  await getConnection().sql.notify(notifyChannel, moduleId);
  await audit({
    action: 'settings.update',
    result: 'success',
    actorId,
    target: `${moduleId}.${key}`,
    // Sensitive values never reach the audit log, even sealed.
    meta: definition.fields[key]?.sensitive ? {} : { value: parsed },
  });
}

/** Back to the default: the row is deleted, not overwritten with the default value. */
export async function resetSetting(
  moduleId: string,
  key: string,
  actorId: string | null,
): Promise<void> {
  await getDb()
    .delete(settingsTable)
    .where(and(eq(settingsTable.module, moduleId), eq(settingsTable.key, key)));
  await getConnection().sql.notify(notifyChannel, moduleId);
  await audit({
    action: 'settings.reset',
    result: 'success',
    actorId,
    target: `${moduleId}.${key}`,
  });
}
