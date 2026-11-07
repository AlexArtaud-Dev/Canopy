'use server';

import { redirect } from 'next/navigation';

import { runAction, type ActionResult } from '@/shared/lib/action';
import { AppBaseError } from '@/shared/lib/errors';
import { getConnection } from '@/shared/db/client';
import { audit } from '@/features/audit/server/audit-writer';
import { getSettings } from '@/features/settings/server/settings-store';

import { authSettings } from '../auth.settings';
import { newAccountSchema } from '../auth.utils';
import { createAccount } from './create-account';
import { assertPasswordAllowed } from './password-policy';
import { authRequestHeaders, getConfiguredAuth, setupBlocker } from './current-session';

// Arbitrary constant: serializes concurrent wizard submissions across instances.
const setupLockId = 7_201_301;

/**
 * Creates the first administrator, signs them in and moves to the confirmation step. Only works
 * once, and only from the LAN.
 */
export async function completeSetup(input: unknown): Promise<ActionResult<null>> {
  const result = await runAction(async () => {
    const { values: policy } = await getSettings('auth', authSettings);
    const parsed = newAccountSchema(policy.passwordMinLength).safeParse(input);
    if (!parsed.success) {
      throw new AppBaseError('system.bad_request', 'invalid setup input');
    }
    const lock = await getConnection().sql.reserve();
    try {
      await lock`SELECT pg_advisory_lock(${setupLockId})`;
      const blocker = await setupBlocker();
      if (blocker) {
        await audit({ action: 'auth.setup', result: 'denied', meta: { reason: blocker } });
        throw new AppBaseError(`auth.setup_${blocker}`, 'setup refused');
      }
      const { username, displayName, contactEmail, password } = parsed.data;
      await assertPasswordAllowed(password, policy);
      const { id } = await createAccount({
        username,
        displayName,
        contactEmail,
        password,
        roleKeys: ['admin'],
      });
      await audit({ action: 'auth.setup', result: 'success', actorId: id, target: id });

      const [{ auth }, headers] = await Promise.all([getConfiguredAuth(), authRequestHeaders()]);
      await auth.api.signInUsername({ body: { username, password }, headers });
      await audit({ action: 'auth.sign_in', result: 'success', actorId: id });
    } finally {
      await lock`SELECT pg_advisory_unlock(${setupLockId})`;
      lock.release();
    }
    return null;
  });
  // Outside runAction: a redirect is thrown, and must not be mistaken for a failure. The new
  // session cookie re-renders `/setup` (now locked), so the wizard finishes on its own page.
  if (result.ok) redirect('/setup/done');
  return result;
}
