import 'server-only';

import { appRegistry } from '@/modules';
import { isLocalRequest } from '@/shared/request/request-context';

import { describeModule, type FieldView } from '../settings-form.utils';
import { getSettings } from './settings-store';

/** Modules whose settings live on their own page (linked from the generated one). */
export const modulesWithOwnPage: ReadonlySet<string> = new Set(['mail', 'plugins']);

export interface ModuleSettingsView {
  module: string;
  fields: FieldView[];
}

/** Every module's settings for the generated page, plus whether local-only fields are editable. */
export async function getSettingsView(): Promise<{
  modules: ModuleSettingsView[];
  local: boolean;
}> {
  const withSettings = appRegistry.modules.flatMap((module) =>
    module.settings && !modulesWithOwnPage.has(module.id)
      ? [{ id: module.id, definition: module.settings }]
      : [],
  );
  const modules = await Promise.all(
    withSettings.map(async ({ id, definition }) => {
      const resolved = await getSettings(id, definition);
      return {
        module: id,
        fields: describeModule(definition, {
          values: resolved.values,
          locked: resolved.locked,
          modified: resolved.modified,
        }),
      };
    }),
  );
  return { modules, local: await isLocalRequest() };
}
