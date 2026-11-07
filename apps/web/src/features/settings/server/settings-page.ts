'use server';

import { appRegistry } from '@/modules';
import { runAction, type ActionResult } from '@/shared/lib/action';
import { AppBaseError } from '@/shared/lib/errors';
import type { SettingsDefinition } from '@/shared/modules/settings.types';
import { isLocalRequest } from '@/shared/request/request-context';
import { authorize } from '@/features/auth';

import { settingResetSchema, settingUpdateSchema } from '../settings-form.utils';
import { resetSetting, updateSetting } from './settings-store';

function definitionOf(moduleId: string, key: string): SettingsDefinition {
  const definition = appRegistry.modules.find((module) => module.id === moduleId)?.settings;
  if (!definition?.fields[key]) {
    throw new AppBaseError('settings.unknown_key', 'unknown setting', { params: { key } });
  }
  return definition;
}

async function assertEditable(definition: SettingsDefinition, key: string): Promise<void> {
  if (definition.fields[key]?.localOnly && !(await isLocalRequest())) {
    throw new AppBaseError('settings.local_only', 'local network required', { params: { key } });
  }
}

/** Saves one field (validated, env-lock checked, encrypted when sensitive, audited). */
export async function saveSetting(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const parsed = settingUpdateSchema.safeParse(input);
    if (!parsed.success) throw new AppBaseError('system.bad_request', 'invalid input');
    const { user } = await authorize('settings:update');
    const definition = definitionOf(parsed.data.module, parsed.data.key);
    await assertEditable(definition, parsed.data.key);
    await updateSetting(
      parsed.data.module,
      definition,
      parsed.data.key,
      parsed.data.value,
      user.id,
    );
    return null;
  });
}

/** Back to the default value. */
export async function resetSettingToDefault(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const parsed = settingResetSchema.safeParse(input);
    if (!parsed.success) throw new AppBaseError('system.bad_request', 'invalid input');
    const { user } = await authorize('settings:update');
    const definition = definitionOf(parsed.data.module, parsed.data.key);
    await assertEditable(definition, parsed.data.key);
    await resetSetting(parsed.data.module, parsed.data.key, user.id);
    return null;
  });
}
