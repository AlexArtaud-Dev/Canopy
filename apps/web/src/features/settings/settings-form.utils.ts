import { z } from 'zod';

import type { SettingsDefinition } from '@/shared/modules/settings.types';

export type FieldControl =
  | { kind: 'boolean' }
  | { kind: 'number'; min: number | null; max: number | null }
  | { kind: 'text'; maxLength: number | null; email: boolean }
  | { kind: 'select'; options: string[] };

function unwrap(type: z.core.$ZodType): z.core.$ZodType {
  return type instanceof z.ZodDefault ? type.unwrap() : type;
}

/** A real bound, or null: `.int()` alone reports ±MAX_SAFE_INTEGER, which is no bound at all. */
function bound(value: number | null): number | null {
  return value === null || Math.abs(value) >= Number.MAX_SAFE_INTEGER ? null : value;
}

/** Which control renders a setting, read from its Zod type (no hand-written screens). */
export function describeField(type: z.core.$ZodType): FieldControl {
  const inner = unwrap(type);
  if (inner instanceof z.ZodBoolean) return { kind: 'boolean' };
  if (inner instanceof z.ZodNumber) {
    return { kind: 'number', min: bound(inner.minValue), max: bound(inner.maxValue) };
  }
  if (inner instanceof z.ZodEnum)
    return { kind: 'select', options: [...inner.options].map(String) };
  if (inner instanceof z.ZodString) {
    return { kind: 'text', maxLength: inner.maxLength, email: false };
  }
  // `'' | email` unions: an optional email address.
  if (inner instanceof z.ZodUnion) return { kind: 'text', maxLength: null, email: true };
  return { kind: 'text', maxLength: null, email: false };
}

export interface FieldView {
  key: string;
  group: string;
  control: FieldControl;
  value: unknown;
  defaultValue: unknown;
  sensitive: boolean;
  locked: boolean;
  localOnly: boolean;
  requiresRestart: boolean;
  modified: boolean;
  env: string | null;
}

/** Everything the settings page needs about one module's fields, sensitive values withheld. */
export function describeModule(
  definition: SettingsDefinition,
  resolved: {
    values: Record<string, unknown>;
    locked: ReadonlySet<string>;
    modified: ReadonlySet<string>;
  },
): FieldView[] {
  const defaults = definition.schema.parse({}) as Record<string, unknown>;
  return Object.entries(definition.fields).map(([key, field]) => {
    const type = definition.schema.shape[key];
    return {
      key,
      group: field.group,
      control: type ? describeField(type) : { kind: 'text', maxLength: null, email: false },
      value: field.sensitive ? null : resolved.values[key],
      defaultValue: field.sensitive ? null : defaults[key],
      sensitive: field.sensitive === true,
      locked: resolved.locked.has(key),
      localOnly: field.localOnly === true,
      requiresRestart: field.requiresRestart === true,
      modified: resolved.modified.has(key),
      env: field.env ?? null,
    };
  });
}

/** Case-insensitive match on the translated label, description or key. */
export function matchesSearch(search: string, ...texts: readonly string[]): boolean {
  const needle = search.trim().toLowerCase();
  return needle === '' || texts.some((text) => text.toLowerCase().includes(needle));
}

/** Form strings → typed value for one control (validation stays on the server). */
export function parseFieldInput(control: FieldControl, raw: string | boolean): unknown {
  if (control.kind === 'boolean') return raw === true || raw === 'true';
  if (control.kind === 'number') return raw === '' ? Number.NaN : Number(raw);
  return typeof raw === 'string' ? raw : String(raw);
}

export const settingUpdateSchema = z.object({
  module: z.string().min(1).max(64),
  key: z.string().min(1).max(64),
  value: z.unknown(),
});

export const settingResetSchema = settingUpdateSchema.omit({ value: true });
