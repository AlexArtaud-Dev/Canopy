import { z } from 'zod';

import { AppBaseError } from '@/shared/lib/errors';
import type { SettingsDefinition } from '@/shared/modules/settings.types';

export interface StoredSetting {
  key: string;
  /** Already decrypted when the field is sensitive. */
  value: unknown;
}

export interface ResolvedSettings<T> {
  values: T;
  /** Keys whose value comes from the environment and cannot be edited. */
  locked: ReadonlySet<string>;
  /** Keys whose stored value differs from the default. */
  modified: ReadonlySet<string>;
  /** Stored values that no longer match the schema (ignored, default used). */
  invalid: readonly string[];
}

/** Env values are strings: coerce them to the field type before validation. */
function fromEnv(raw: string, field: z.core.$ZodType): unknown {
  const inner = field instanceof z.ZodDefault ? field.unwrap() : field;
  if (inner instanceof z.ZodNumber) return Number(raw);
  if (inner instanceof z.ZodBoolean) return ['true', '1', 'yes', 'on'].includes(raw.toLowerCase());
  return raw;
}

/**
 * Merges defaults, stored values and environment overrides (highest precedence). Never throws:
 * a bad stored value falls back to the default so one corrupt row cannot take the app down.
 */
export function resolveSettings<T extends z.ZodRawShape>(
  definition: SettingsDefinition<T>,
  stored: readonly StoredSetting[],
  env: Readonly<Record<string, string | undefined>>,
): ResolvedSettings<z.infer<z.ZodObject<T>>> {
  const shape: Readonly<Record<string, z.core.$ZodType>> = definition.schema.shape;
  const storedByKey = new Map(stored.map((row) => [row.key, row.value]));
  const merged: Record<string, unknown> = {};
  const locked = new Set<string>();
  const modified = new Set<string>();
  const invalid: string[] = [];

  for (const [key, field] of Object.entries(shape)) {
    const envName = definition.fields[key]?.env;
    const envValue = envName === undefined ? undefined : env[envName];
    if (envValue !== undefined) {
      const fromEnvironment = z.safeParse(field, fromEnv(envValue, field));
      if (fromEnvironment.success) {
        merged[key] = fromEnvironment.data;
        locked.add(key);
        continue;
      }
      invalid.push(key);
    }
    if (!storedByKey.has(key)) continue;
    const parsed = z.safeParse(field, storedByKey.get(key));
    if (parsed.success) {
      merged[key] = parsed.data;
      modified.add(key);
    } else {
      invalid.push(key);
    }
  }

  return { values: definition.schema.parse(merged), locked, modified, invalid };
}

export const settingsErrorCodes = {
  unknownKey: 'settings.unknown_key',
  invalidValue: 'settings.invalid_value',
  locked: 'settings.locked_by_env',
} as const;

/** Validates one field update and returns the parsed value to store. */
export function validateSettingUpdate<T extends z.ZodRawShape>(
  definition: SettingsDefinition<T>,
  key: string,
  value: unknown,
  env: Readonly<Record<string, string | undefined>>,
): unknown {
  const shape: Readonly<Record<string, z.core.$ZodType>> = definition.schema.shape;
  const field = shape[key];
  if (!field) {
    throw new AppBaseError(settingsErrorCodes.unknownKey, `unknown setting ${key}`, {
      params: { key },
    });
  }
  const envName = definition.fields[key]?.env;
  if (envName !== undefined && env[envName] !== undefined) {
    throw new AppBaseError(settingsErrorCodes.locked, `${key} is set by ${envName}`, {
      params: { key, env: envName },
    });
  }
  const parsed = z.safeParse(field, value);
  if (!parsed.success) {
    throw new AppBaseError(settingsErrorCodes.invalidValue, `invalid value for ${key}`, {
      params: { key },
      cause: parsed.error,
    });
  }
  return parsed.data;
}
