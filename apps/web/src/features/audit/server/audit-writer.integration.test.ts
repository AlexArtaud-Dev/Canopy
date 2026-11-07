/**
 * @jest-environment node
 */
// Runs only against a disposable database: CANOPY_TEST_WEB_DATABASE_URL (canopy_web role).
import { getConnection } from '@/shared/db/client';
import { runMigrations } from '@/shared/db/migrate';

import { audit } from './audit-writer';

jest.mock('server-only', () => ({}));
const errorLog = jest.fn();
jest.mock('@/shared/request/request-context', () => ({
  getRequestContext: () =>
    Promise.resolve({
      requestId: 'itest-audit',
      clientIp: '203.0.113.7',
      logger: { error: errorLog },
    }),
}));

const databaseUrl = process.env.CANOPY_TEST_WEB_DATABASE_URL;
const describeWithDb = databaseUrl ? describe : describe.skip;

describeWithDb('audit log (Postgres)', () => {
  const sql = () => getConnection().sql;

  beforeAll(async () => {
    process.env.CANOPY_DATABASE_URL = databaseUrl;
    await runMigrations();
  });

  afterAll(async () => {
    await sql().begin(async (tx) => {
      await tx`SET LOCAL canopy.audit_purge = 'on'`;
      await tx`DELETE FROM audit.events WHERE request_id = 'itest-audit'`;
    });
    await sql().end({ timeout: 5 });
  });

  it('appends events with request context and sanitized metadata', async () => {
    await audit({
      action: 'settings.update',
      result: 'success',
      actorId: 'admin-1',
      target: 'auth.sessionDays',
      meta: { value: 14, password: 'nope' },
    });
    const [event] = await sql()<
      { actor_ip: string; request_id: string; meta: { value: number; password: string } }[]
    >`SELECT host(actor_ip) AS actor_ip, request_id, meta FROM audit.events
      WHERE request_id = 'itest-audit' AND target = 'auth.sessionDays'`;
    expect(event).toMatchObject({
      actor_ip: '203.0.113.7',
      request_id: 'itest-audit',
      meta: { value: 14, password: '[redacted]' },
    });
  });

  it('logs undeclared actions loudly but still records them', async () => {
    errorLog.mockClear();
    await audit({ action: 'nope.made_up', result: 'denied' });
    expect(errorLog).toHaveBeenCalledWith('undeclared audit action', { action: 'nope.made_up' });
  });

  it('rejects updates, deletes and truncation outside the retention purge', async () => {
    await expect(
      sql()`UPDATE audit.events SET result = 'error' WHERE request_id = 'itest-audit'`,
    ).rejects.toThrow(/append-only/);
    await expect(sql()`DELETE FROM audit.events WHERE request_id = 'itest-audit'`).rejects.toThrow(
      /append-only/,
    );
    await expect(sql()`TRUNCATE audit.events`).rejects.toThrow(/append-only/);
  });
});
