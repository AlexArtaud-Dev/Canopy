'use server';

import { isAPIError } from 'better-auth/api';

import { runAction, type ActionResult } from '@/shared/lib/action';
import { AppBaseError } from '@/shared/lib/errors';
import {
  clearRateLimit,
  consume,
  enforceRateLimit,
  readLockout,
} from '@/shared/rate-limit/rate-limit';
import { getRequestContext } from '@/shared/request/request-context';
import { audit } from '@/features/audit/server/audit-writer';

import { safeRedirectPath, signInInputSchema } from '../auth.utils';
import { authRequestHeaders, getConfiguredAuth } from './current-session';
import { assertAddressAllowed, recordAddressFailure } from './ip-block';
import { notifyIfNewDevice } from './security-notices';
import { hasTotpEnabled } from './totp-factor';

/** Per client IP, whatever the account: slows down password spraying. */
const perIpRule = { limit: 10, windowSeconds: 60 };
const lockoutScope = 'auth.lockout';

function lockedError(retryAfterSeconds: number): AppBaseError {
  return new AppBaseError('auth.locked', 'account temporarily locked', {
    params: { minutes: Math.ceil(retryAfterSeconds / 60) },
  });
}

/** Signs in with username + password; returns where to go next. */
export async function signIn(input: unknown): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction(async () => {
    const parsed = signInInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new AppBaseError('auth.invalid_credentials', 'malformed sign-in input');
    }
    const { username, password, next } = parsed.data;
    const context = await getRequestContext();
    await enforceRateLimit('auth.sign_in', context.clientIp ?? 'unknown', perIpRule);

    const [{ auth, policy }, headers] = await Promise.all([
      getConfiguredAuth(),
      authRequestHeaders(),
    ]);
    // Failures are counted per account name, so one attacker cannot hide behind many IPs.
    await assertAddressAllowed(policy);
    const account = username.toLowerCase();
    const lockoutRule = {
      limit: policy.lockoutThreshold,
      windowSeconds: policy.lockoutMinutes * 60,
    };
    const lockout = await readLockout(lockoutScope, account, lockoutRule);
    if (lockout.locked) {
      await audit({
        action: 'auth.sign_in',
        result: 'denied',
        meta: { username, reason: 'locked' },
      });
      throw lockedError(lockout.retryAfterSeconds);
    }

    let userId: string;
    try {
      const result = await auth.api.signInUsername({ body: { username, password }, headers });
      userId = result.user.id;
    } catch (error) {
      if (!isAPIError(error)) throw error;
      await recordAddressFailure(policy);
      const failures = await consume(lockoutScope, account, lockoutRule);
      const nowLocked = failures.remaining === 0;
      // Same answer for unknown user and wrong password; the attempted name is kept for admins.
      await audit({
        action: 'auth.sign_in',
        result: 'denied',
        meta: { username, reason: nowLocked ? 'locked' : 'invalid_credentials' },
      });
      if (nowLocked) throw lockedError(lockoutRule.windowSeconds);
      throw new AppBaseError('auth.invalid_credentials', 'sign-in rejected', { cause: error });
    }

    await clearRateLimit(lockoutScope, account);
    // The session hook already marked the session pending when the account uses 2FA.
    const secondFactor = await hasTotpEnabled(userId);
    await audit({
      action: 'auth.sign_in',
      result: 'success',
      actorId: userId,
      meta: secondFactor ? { secondFactor: 'pending' } : {},
    });
    if (policy.notifyNewSignIn) await notifyIfNewDevice(userId);
    const destination = safeRedirectPath(next);
    if (!secondFactor) return { redirectTo: destination };
    const query = destination === '/' ? '' : `?next=${encodeURIComponent(destination)}`;
    return { redirectTo: `/login/verify${query}` };
  });
}
