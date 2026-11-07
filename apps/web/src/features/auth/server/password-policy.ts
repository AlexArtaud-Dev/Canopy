import 'server-only';

import { AppBaseError } from '@/shared/lib/errors';
import { logger } from '@/shared/lib/logger';

import { isSuffixBreached, pwnedRangeQuery } from '../password-policy.utils';

const log = logger.child({ module: 'auth' });
const pwnedTimeoutMs = 3000;

async function isBreached(password: string): Promise<boolean> {
  const { prefix, suffix } = pwnedRangeQuery(password);
  try {
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true', 'User-Agent': 'Canopy' },
      signal: AbortSignal.timeout(pwnedTimeoutMs),
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
    return isSuffixBreached(await response.text(), suffix);
  } catch (error) {
    // Fail open: an unreachable service must not block account management.
    log.warn('breached-password check unavailable', { error });
    return false;
  }
}

/** Server-side policy checks beyond the length rule the schema already enforced. */
export async function assertPasswordAllowed(
  password: string,
  policy: { checkBreachedPasswords: boolean },
): Promise<void> {
  if (policy.checkBreachedPasswords && (await isBreached(password))) {
    throw new AppBaseError('auth.password_breached', 'password found in a public breach');
  }
}
