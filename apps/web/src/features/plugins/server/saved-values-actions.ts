'use server';

import { runAction, type ActionResult } from '@/shared/lib/action';
import { AppBaseError } from '@/shared/lib/errors';
import { adminPermission } from '@/features/access/access.utils';
import { authorize, requireSession } from '@/features/auth';
import { getSettings, updateSetting } from '@/features/settings/server/settings-store';

import { pluginsSettings } from '../plugins.settings';
import {
  savedValueInputSchema,
  savedValueKeySchema,
  withSavedValue,
  withoutSavedValue,
  type SavedValues,
} from '../saved-values.utils';

async function stored(): Promise<SavedValues> {
  const { values } = await getSettings('plugins', pluginsSettings);
  return values.savedValues;
}

/** Saved as a setting, so audited as `settings.update` like any edit on the settings page. */
async function store(saved: SavedValues, actorId: string): Promise<void> {
  await updateSetting('plugins', pluginsSettings, 'savedValues', saved, actorId);
}

/**
 * The values administrators saved for plugin fields. Anyone signed in reads them: they only
 * prefill forms, and the engine still validates and authorizes what is run.
 */
export async function loadSavedValues(): Promise<ActionResult<SavedValues>> {
  return runAction(async () => {
    await requireSession();
    return stored();
  });
}

/** Saves a labelled value for a plugin field (administrators). */
export async function saveValue(input: unknown): Promise<ActionResult<SavedValues>> {
  return runAction(async () => {
    const session = await authorize(adminPermission);
    const parsed = savedValueInputSchema.safeParse(input);
    if (!parsed.success) throw new AppBaseError('plugins.invalid_saved_value', 'invalid value');
    const { plugin, field, label, value } = parsed.data;
    const next = withSavedValue(await stored(), plugin, field, { label, value });
    if (!next) throw new AppBaseError('plugins.saved_values_full', 'too many saved values');
    await store(next, session.user.id);
    return next;
  });
}

/** Forgets a saved value (administrators). */
export async function removeSavedValue(input: unknown): Promise<ActionResult<SavedValues>> {
  return runAction(async () => {
    const session = await authorize(adminPermission);
    const parsed = savedValueKeySchema.safeParse(input);
    if (!parsed.success) throw new AppBaseError('system.bad_request', 'invalid input');
    const next = withoutSavedValue(
      await stored(),
      parsed.data.plugin,
      parsed.data.field,
      parsed.data.value,
    );
    await store(next, session.user.id);
    return next;
  });
}
