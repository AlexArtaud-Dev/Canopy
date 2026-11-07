import 'server-only';

import { getConnection } from '@/shared/db/client';
import { AppBaseError } from '@/shared/lib/errors';

import {
  decide,
  lockoutState,
  rateLimitKey,
  type LockoutState,
  type RateLimitDecision,
  type RateLimitRule,
} from './rate-limit.utils';

const staleAfter = '1 day';

/**
 * Counts one hit for `scope:subject` atomically in Postgres (one upsert, no race between
 * instances) and says whether it is allowed.
 */
export async function consume(
  scope: string,
  subject: string,
  rule: RateLimitRule,
): Promise<RateLimitDecision> {
  const { sql } = getConnection();
  // postgres.js 4 returns timestamptz as ISO strings; convert explicitly.
  const [row] = await sql<{ hits: number; window_start: string | Date; now: string | Date }[]>`
    INSERT INTO app.rate_limits AS r (key, window_start, hits)
    VALUES (${rateLimitKey(scope, subject)}, now(), 1)
    ON CONFLICT (key) DO UPDATE SET
      hits = CASE WHEN r.window_start <= now() - make_interval(secs => ${rule.windowSeconds})
                  THEN 1 ELSE r.hits + 1 END,
      window_start = CASE WHEN r.window_start <= now() - make_interval(secs => ${rule.windowSeconds})
                          THEN now() ELSE r.window_start END
    RETURNING hits, window_start, now() AS now`;

  // Opportunistic cleanup keeps the table small without a scheduler.
  if (Math.random() < 0.01) {
    await sql`DELETE FROM app.rate_limits WHERE window_start < now() - ${staleAfter}::interval`;
  }
  if (!row) {
    throw new Error('rate limit upsert returned no row');
  }
  return decide(rule, row.hits, new Date(row.window_start), new Date(row.now));
}

/** Same as `consume` but throws `system.rate_limited` (with `retryAfter`) when over the limit. */
export async function enforceRateLimit(
  scope: string,
  subject: string,
  rule: RateLimitRule,
): Promise<void> {
  const decision = await consume(scope, subject, rule);
  if (!decision.allowed) {
    throw new AppBaseError('system.rate_limited', `rate limit exceeded for ${scope}`, {
      params: { retryAfter: decision.retryAfterSeconds },
    });
  }
}

/** Current lockout for `scope:subject` without counting a hit. */
export async function readLockout(
  scope: string,
  subject: string,
  rule: RateLimitRule,
): Promise<LockoutState> {
  const { sql } = getConnection();
  const [row] = await sql<{ hits: number; window_start: string | Date; now: string | Date }[]>`
    SELECT hits, window_start, now() AS now FROM app.rate_limits
    WHERE key = ${rateLimitKey(scope, subject)}`;
  if (!row) return { locked: false, retryAfterSeconds: 0 };
  return lockoutState(rule, row.hits, new Date(row.window_start), new Date(row.now));
}

/** Forgets the counter, e.g. failed logins after a successful one. */
export async function clearRateLimit(scope: string, subject: string): Promise<void> {
  const { sql } = getConnection();
  await sql`DELETE FROM app.rate_limits WHERE key = ${rateLimitKey(scope, subject)}`;
}
