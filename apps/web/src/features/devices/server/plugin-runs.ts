import 'server-only';

import {
  listCommands,
  startCommand,
  type CommandCatalog,
  type CommandEntry,
  type DeviceKind,
  type Job,
} from '@canopy/contracts';

import { AppBaseError } from '@/shared/lib/errors';
import type { engineClientFor } from '@/features/files/server/engine-client';
import { initialValues, requestValues } from '@/features/commands/commands.utils';
import { savedDefaults } from '@/features/plugins/saved-values.utils';
import { loadSavedValues } from '@/features/plugins/server/saved-values-actions';

import { assertDevicesAllowed } from './device-access';

export type EngineClient = Awaited<ReturnType<typeof engineClientFor>>;

/** Parses an action's input; anything else is a bad request. */
export function parse<T>(
  schema: { safeParse: (input: unknown) => { success: boolean; data?: T } },
  input: unknown,
): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success || parsed.data === undefined) {
    throw new AppBaseError('system.bad_request', 'invalid input');
  }
  return parsed.data;
}

/** The commands the caller may see: the engine decides. */
export async function catalogFor(client: EngineClient): Promise<CommandCatalog> {
  const { data, response } = await listCommands({ client });
  if (!response) throw new AppBaseError('system.engine_unavailable', 'engine unreachable');
  if (!data) throw new AppBaseError('commands.unavailable', 'catalog refused');
  return data;
}

/** The kind as the plugin declares it, among the commands the caller may see. */
export function declaredKind(catalog: CommandCatalog, pluginId: string, kind: string): DeviceKind {
  for (const entry of catalog.entries) {
    if (entry.plugin?.id !== pluginId) continue;
    const declared = entry.plugin.devices?.find((candidate) => candidate.kind === kind);
    if (declared) return declared;
  }
  throw new AppBaseError('devices.unknown_kind', 'no such device kind');
}

/** A command of the catalog by id, or why it cannot be run. */
export function entryOf(catalog: CommandCatalog, id: string): CommandEntry {
  const entry = catalog.entries.find((candidate) => candidate.id === id);
  if (!entry) throw new AppBaseError('commands.unavailable', 'command hidden or missing');
  return entry;
}

/**
 * Starts a plugin command as the caller (authorized and audited by the engine like any run), its
 * fields starting with the values saved for the plugin, then with `values`. A device the person
 * may not use is refused here.
 */
export async function startPluginCommand(
  client: EngineClient,
  pluginId: string,
  entry: CommandEntry,
  values: Readonly<Record<string, string>> = {},
): Promise<Job> {
  const saved = await loadSavedValues();
  const defaults = savedDefaults(saved.ok ? (saved.data[pluginId] ?? {}) : {});
  const params = requestValues(
    entry.params,
    initialValues(entry.params, { ...defaults, ...values }),
  );
  await assertDevicesAllowed(entry, params);
  const started = await startCommand({
    client,
    body: { entry: entry.id, params, dryRun: false },
  });
  if (started.data) return started.data;
  if (!started.response) throw new AppBaseError('system.engine_unavailable', 'engine unreachable');
  throw new AppBaseError(started.error.code, 'command refused');
}
