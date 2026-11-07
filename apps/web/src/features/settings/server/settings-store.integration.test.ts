/**
 * @jest-environment node
 */
// Runs only against a disposable database: CANOPY_TEST_WEB_DATABASE_URL (canopy_web role).
// The modules below read their environment lazily, so setting it in beforeAll is enough.
import { randomBytes } from 'node:crypto';

import { z } from 'zod';

import { getConnection } from '@/shared/db/client';
import { runMigrations } from '@/shared/db/migrate';
import { defineSettings } from '@/shared/modules/settings.types';

import { getSettings, resetSetting, updateSetting } from './settings-store';

jest.mock('server-only', () => ({}));

const databaseUrl = process.env.CANOPY_TEST_WEB_DATABASE_URL;
const describeWithDb = databaseUrl ? describe : describe.skip;

const definition = defineSettings({
  schema: z.object({
    retentionDays: z.number().int().min(1).default(30),
    apiToken: z.string().default(''),
  }),
  fields: { retentionDays: { group: 'general' }, apiToken: { group: 'general', sensitive: true } },
});

/** NOTIFY is asynchronous: poll until the cache reflects the expected value. */
async function eventually<T>(read: () => Promise<T>, expected: T): Promise<T> {
  let value = await read();
  for (
    let attempt = 0;
    attempt < 40 && JSON.stringify(value) !== JSON.stringify(expected);
    attempt += 1
  ) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    value = await read();
  }
  return value;
}

describeWithDb('settings store (Postgres)', () => {
  const moduleId = `itest-${randomBytes(4).toString('hex')}`;
  const read = async () => (await getSettings(moduleId, definition)).values;

  beforeAll(async () => {
    process.env.CANOPY_DATABASE_URL = databaseUrl;
    process.env.CANOPY_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    await runMigrations();
  });

  afterAll(async () => {
    await getConnection().sql`DELETE FROM app.settings WHERE module = ${moduleId}`;
    await getConnection().sql.end({ timeout: 5 });
  });

  it('returns defaults, stores changes, encrypts sensitive values and resets', async () => {
    expect(await read()).toEqual({ retentionDays: 30, apiToken: '' });

    await updateSetting(moduleId, definition, 'retentionDays', 90, 'admin-1');
    await updateSetting(moduleId, definition, 'apiToken', 's3cr3t', 'admin-1');
    expect(await eventually(read, { retentionDays: 90, apiToken: 's3cr3t' })).toEqual({
      retentionDays: 90,
      apiToken: 's3cr3t',
    });

    const [row] = await getConnection().sql<{ value: unknown }[]>`
      SELECT value FROM app.settings WHERE module = ${moduleId} AND key = 'apiToken'`;
    expect(JSON.stringify(row?.value)).not.toContain('s3cr3t');

    await resetSetting(moduleId, 'retentionDays');
    expect(await eventually(read, { retentionDays: 30, apiToken: 's3cr3t' })).toEqual({
      retentionDays: 30,
      apiToken: 's3cr3t',
    });
  });
});
