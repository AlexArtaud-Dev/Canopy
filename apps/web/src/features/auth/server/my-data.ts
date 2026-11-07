'use server';

import { runAction, type ActionResult } from '@/shared/lib/action';
import { AppBaseError } from '@/shared/lib/errors';
import { audit } from '@/features/audit/server/audit-writer';
import { collectPersonalData } from '@/features/users/server/personal-data';

import { requireSession } from './current-session';

/** RGPD access right for the signed-in user: download their own data. */
export async function exportMyData(): Promise<ActionResult<{ json: string }>> {
  return runAction(async () => {
    const { user } = await requireSession();
    const data = await collectPersonalData(user.id);
    if (!data) throw new AppBaseError('system.not_found', 'user not found');
    await audit({ action: 'auth.data_export', result: 'success', actorId: user.id });
    return { json: JSON.stringify(data, null, 2) };
  });
}
