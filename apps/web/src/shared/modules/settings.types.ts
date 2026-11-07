import type { z } from 'zod';

export interface SettingField {
  /** Groups fields on the generated settings page. */
  group: string;
  /** Encrypted at rest and never sent back to the browser in clear. */
  sensitive?: boolean;
  /** Editable only from a local IP (`CANOPY_LOCAL_NETWORKS`). */
  localOnly?: boolean;
  /** The app must be restarted for a change to take effect. */
  requiresRestart?: boolean;
  /** Environment variable that overrides the stored value and locks the field. */
  env?: string;
}

/**
 * A module's settings: a Zod object where every field has a default (the app works with zero
 * configuration) plus per-field metadata. Labels live under `settings.<module>.<key>`.
 */
export interface SettingsDefinition<TShape extends z.ZodRawShape = z.ZodRawShape> {
  schema: z.ZodObject<TShape>;
  fields: { [K in keyof TShape]: SettingField };
}

export function defineSettings<TShape extends z.ZodRawShape>(
  definition: SettingsDefinition<TShape>,
): SettingsDefinition<TShape> {
  return definition;
}
