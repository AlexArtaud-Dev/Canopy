'use server';

import { isAPIError } from 'better-auth/api';

import { runAction, type ActionResult } from '@/shared/lib/action';
import { AppBaseError } from '@/shared/lib/errors';
import { enforceRateLimit } from '@/shared/rate-limit/rate-limit';
import { getRequestContext } from '@/shared/request/request-context';
import { audit } from '@/features/audit/server/audit-writer';

import { safeRedirectPath, signInInputSchema } from '../auth.utils';
import { authRequestHeaders, getConfiguredAuth } from './current-session';

const signInRule = { limit: 10, windowSeconds: 60 };

/** Signs in with username + password; returns where to go next. */
export async function signIn(input: unknown): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction(async () => {
    const parsed = signInInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new AppBaseError('auth.invalid_credentials', 'malformed sign-in input');
    }
    const { username, password, next } = parsed.data;
    const context = await getRequestContext();
    await enforceRateLimit('auth.sign_in', context.clientIp ?? 'unknown', signInRule);

    const [{ auth }, headers] = await Promise.all([getConfiguredAuth(), authRequestHeaders()]);
    try {
      const result = await auth.api.signInUsername({ body: { username, password }, headers });
      await audit({ action: 'auth.sign_in', result: 'success', actorId: result.user.id });
    } catch (error) {
      if (!isAPIError(error)) throw error;
      // Same answer for unknown user and wrong password; the attempted name is kept for admins.
      await audit({ action: 'auth.sign_in', result: 'denied', meta: { username } });
      throw new AppBaseError('auth.invalid_credentials', 'sign-in rejected', { cause: error });
    }
    return { redirectTo: safeRedirectPath(next) };
  });
}
