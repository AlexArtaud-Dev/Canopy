import 'server-only';

import { AppBaseError } from '@/shared/lib/errors';
import { consume, readLockout } from '@/shared/rate-limit/rate-limit';
import { getRequestContext } from '@/shared/request/request-context';
import { audit } from '@/features/audit/server/audit-writer';

const scope = 'auth.ip_failures';

interface IpBlockPolicy {
  ipBlockThreshold: number;
  ipBlockMinutes: number;
}

function ruleOf(policy: IpBlockPolicy) {
  return { limit: policy.ipBlockThreshold, windowSeconds: policy.ipBlockMinutes * 60 };
}

function blockedError(retryAfterSeconds: number): AppBaseError {
  return new AppBaseError('auth.ip_blocked', 'client address blocked', {
    params: { minutes: Math.ceil(retryAfterSeconds / 60) },
  });
}

async function subject(): Promise<string> {
  return (await getRequestContext()).clientIp ?? 'unknown';
}

/**
 * Refuses an address that failed too often, whatever the accounts it tried: repeatedly locking
 * one account, or spraying many, ends with the address itself blocked.
 */
export async function assertAddressAllowed(policy: IpBlockPolicy): Promise<void> {
  const state = await readLockout(scope, await subject(), ruleOf(policy));
  if (state.locked) throw blockedError(state.retryAfterSeconds);
}

/** Counts one failed sign-in or code for this address; audits the moment it gets blocked. */
export async function recordAddressFailure(policy: IpBlockPolicy): Promise<void> {
  const decision = await consume(scope, await subject(), ruleOf(policy));
  if (decision.remaining === 0) {
    await audit({
      action: 'auth.ip_block',
      result: 'denied',
      meta: { minutes: policy.ipBlockMinutes, failures: policy.ipBlockThreshold },
    });
  }
}
