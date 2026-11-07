/**
 * @jest-environment node
 */
// Runs only against a disposable database: CANOPY_TEST_WEB_DATABASE_URL (canopy_web role).
import { randomBytes } from 'node:crypto';

import { getConnection } from '@/shared/db/client';
import { runMigrations } from '@/shared/db/migrate';
import type { AppBaseError } from '@/shared/lib/errors';

import { consume, enforceRateLimit } from './rate-limit';

jest.mock('server-only', () => ({}));

const databaseUrl = process.env.CANOPY_TEST_WEB_DATABASE_URL;
const describeWithDb = databaseUrl ? describe : describe.skip;

describeWithDb('rate limiter (Postgres)', () => {
  const scope = `itest.${randomBytes(4).toString('hex')}`;

  beforeAll(async () => {
    process.env.CANOPY_DATABASE_URL = databaseUrl;
    await runMigrations();
  });

  afterAll(async () => {
    await getConnection().sql`DELETE FROM app.rate_limits WHERE key LIKE ${`${scope}%`}`;
    await getConnection().sql.end({ timeout: 5 });
  });

  it('counts concurrent hits exactly and blocks past the limit', async () => {
    const rule = { limit: 5, windowSeconds: 60 };
    const decisions = await Promise.all(
      Array.from({ length: 8 }, () => consume(scope, '203.0.113.7', rule)),
    );
    expect(decisions.filter((decision) => decision.allowed)).toHaveLength(5);
    expect(decisions.filter((decision) => !decision.allowed)).toHaveLength(3);

    await expect(enforceRateLimit(scope, '203.0.113.7', rule)).rejects.toMatchObject({
      code: 'system.rate_limited',
    } satisfies Partial<AppBaseError>);
    await expect(enforceRateLimit(scope, '198.51.100.1', rule)).resolves.toBeUndefined();
  });

  it('starts a new window once the previous one expired', async () => {
    const rule = { limit: 1, windowSeconds: 1 };
    expect((await consume(scope, 'window', rule)).allowed).toBe(true);
    expect((await consume(scope, 'window', rule)).allowed).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect((await consume(scope, 'window', rule)).allowed).toBe(true);
  });
});
