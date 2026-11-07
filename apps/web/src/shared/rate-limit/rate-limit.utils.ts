export interface RateLimitRule {
  /** Maximum hits allowed in one window. */
  limit: number;
  windowSeconds: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  /** Seconds until the current window resets (0 when allowed). */
  retryAfterSeconds: number;
}

/** Interprets the counter the database returned for the current fixed window. */
export function decide(
  rule: RateLimitRule,
  count: number,
  windowStart: Date,
  now: Date,
): RateLimitDecision {
  const allowed = count <= rule.limit;
  const resetAt = windowStart.getTime() + rule.windowSeconds * 1000;
  return {
    allowed,
    remaining: Math.max(0, rule.limit - count),
    retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((resetAt - now.getTime()) / 1000)),
  };
}

/** Bucket key: one namespace per use (`auth.login`) plus the subject (IP or user id). */
export function rateLimitKey(scope: string, subject: string): string {
  return `${scope}:${subject}`;
}
