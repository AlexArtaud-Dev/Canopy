import 'server-only';

import { audit } from '@/features/audit/server/audit-writer';

import { safeRedirectPath } from '../auth.utils';
import { notifyIfNewDevice } from './security-notices';
import { hasTotpEnabled } from './totp-factor';

/**
 * What follows a successful first factor, whatever it was (password or e-mailed link): audit,
 * new-device notice, then home or the second factor. The session hook already marked the
 * session pending when the account uses 2FA.
 */
export async function completeSignIn(
  userId: string,
  next: string | undefined,
  options: { method: 'password' | 'magic_link'; notifyNewSignIn: boolean },
): Promise<{ redirectTo: string }> {
  const secondFactor = await hasTotpEnabled(userId);
  await audit({
    action: 'auth.sign_in',
    result: 'success',
    actorId: userId,
    meta: {
      ...(options.method === 'magic_link' ? { method: 'magic_link' } : {}),
      ...(secondFactor ? { secondFactor: 'pending' } : {}),
    },
  });
  if (options.notifyNewSignIn) await notifyIfNewDevice(userId);
  const destination = safeRedirectPath(next);
  if (!secondFactor) return { redirectTo: destination };
  const query = destination === '/' ? '' : `?next=${encodeURIComponent(destination)}`;
  return { redirectTo: `/login/verify${query}` };
}
