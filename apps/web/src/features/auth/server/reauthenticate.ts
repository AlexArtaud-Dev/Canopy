import 'server-only';

import { AppBaseError } from '@/shared/lib/errors';
import { enforceRateLimit } from '@/shared/rate-limit/rate-limit';

import { getConfiguredAuth } from './current-session';
import { verifyPassword } from './password';

const reauthRule = { limit: 5, windowSeconds: 15 * 60 };

/** Step-up check before sensitive account changes: the current password, rate-limited. */
export async function assertCurrentPassword(userId: string, password: string): Promise<void> {
  await enforceRateLimit('auth.reauth', userId, reauthRule);
  const { auth } = await getConfiguredAuth();
  const context = await auth.$context;
  const account = await context.internalAdapter.findCredentialAccount(userId);
  if (!account?.password || !(await verifyPassword({ hash: account.password, password }))) {
    throw new AppBaseError('auth.invalid_password', 'current password rejected');
  }
}
