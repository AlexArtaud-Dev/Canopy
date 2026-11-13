import type { CommandEntry, CommandParam } from '@canopy/contracts';
import { z } from 'zod';

/** A value an administrator saved for a plugin field: people pick it by its label. */
export interface SavedValue {
  label: string;
  value: string;
}

/** Saved values of one plugin, by field (param) name. */
export type PluginSavedValues = Record<string, SavedValue[]>;

/** Saved values by plugin id. */
export type SavedValues = Record<string, PluginSavedValues>;

/** Enough for the screens of a home or the servers of a team; keeps the setting small. */
export const maxSavedPerField = 20;

const pluginId = z.string().regex(/^[a-z0-9][a-z0-9-]{1,31}$/);
const fieldName = z.string().regex(/^[a-zA-Z][a-zA-Z0-9]{0,39}$/);
// Like any free text sent to a command, a saved value may not look like an option.
const value = z.string().trim().min(1).max(500).regex(/^[^-]/);

const savedValueSchema = z.object({ label: z.string().trim().min(1).max(60), value });

/** How the `plugins.savedValues` setting is stored: by plugin id, then by field name. */
export const savedValuesSchema = z.record(pluginId, z.record(fieldName, z.array(savedValueSchema)));

export const savedValueInputSchema = savedValueSchema.extend({
  plugin: pluginId,
  field: fieldName,
});

export const savedValueKeySchema = z.object({
  plugin: pluginId,
  field: fieldName,
  value: z.string().max(500),
});

/** Adds a value to a field, replacing the one with the same value; null when the field is full. */
export function withSavedValue(
  saved: SavedValues,
  plugin: string,
  field: string,
  item: SavedValue,
): SavedValues | null {
  const others = (saved[plugin]?.[field] ?? []).filter((existing) => existing.value !== item.value);
  if (others.length >= maxSavedPerField) return null;
  return { ...saved, [plugin]: { ...saved[plugin], [field]: [...others, item] } };
}

/** Removes a value; fields and plugins left empty disappear. */
export function withoutSavedValue(
  saved: SavedValues,
  plugin: string,
  field: string,
  removed: string,
): SavedValues {
  const fields = Object.entries(saved[plugin] ?? {})
    .map(([name, items]) =>
      name === field
        ? ([name, items.filter((item) => item.value !== removed)] as const)
        : ([name, items] as const),
    )
    .filter(([, items]) => items.length > 0);
  const rest = Object.entries(saved).filter(([id]) => id !== plugin);
  return Object.fromEntries(
    fields.length > 0 ? [...rest, [plugin, Object.fromEntries(fields)]] : rest,
  );
}

/** What a form starts with: the first saved value of each field. */
export function savedDefaults(saved: PluginSavedValues | undefined): Record<string, string> {
  const defaults: Record<string, string> = {};
  for (const [field, items] of Object.entries(saved ?? {})) {
    const first = items[0];
    if (first) defaults[field] = first.value;
  }
  return defaults;
}

/**
 * Whether values can be saved for a field: free text and numbers, never secrets or paths, nor
 * devices (Canopy keeps those in its device list).
 */
export function isSavable(param: Pick<CommandParam, 'type' | 'secret' | 'device'>): boolean {
  return (
    (param.type === 'string' || param.type === 'int') && !param.secret && param.device === undefined
  );
}

/**
 * The fields of a plugin's commands values can be saved for, once each, in catalog order. Only
 * settings: a field some command requires (a code, a position) is chosen for each run, and the
 * commands reached from elsewhere (secondary) are left out.
 */
export function savableFields(entries: readonly CommandEntry[], plugin: string): CommandParam[] {
  const fields = new Map<string, CommandParam>();
  const perRun = new Set<string>();
  for (const entry of entries) {
    if (entry.plugin?.id !== plugin || entry.secondary === true) continue;
    for (const param of entry.params) {
      if (param.required) perRun.add(param.name);
      if (isSavable(param) && !fields.has(param.name)) fields.set(param.name, param);
    }
  }
  return [...fields.values()].filter((param) => !perRun.has(param.name));
}
