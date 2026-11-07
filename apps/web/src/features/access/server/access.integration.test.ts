/**
 * @jest-environment node
 */
// Runs only against a disposable database: CANOPY_TEST_WEB_DATABASE_URL (canopy_web role).
import { randomBytes } from 'node:crypto';

import { eq } from 'drizzle-orm';

import { getConnection, getDb } from '@/shared/db/client';
import { runMigrations } from '@/shared/db/migrate';
import { createAccount } from '@/features/auth/server/create-account';

import {
  groupMembersTable,
  groupRolesTable,
  groupsTable,
  rolesTable,
  userRolesTable,
} from './access.schema';
import { activeAdminIds, withAdminGuard } from './admin-guard';
import { groupsRequireTwoFactor, loadPermissions } from './permissions';

jest.mock('server-only', () => ({}));
jest.mock('next-intl/server', () => ({ getLocale: () => Promise.resolve('en') }));
jest.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers()),
  cookies: () => Promise.resolve({ set: jest.fn(), get: jest.fn() }),
}));
jest.mock('@/shared/request/request-context', () => ({
  getRequestContext: () =>
    Promise.resolve({
      requestId: 'itest',
      clientIp: '127.0.0.1',
      logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
    }),
  isLocalRequest: () => Promise.resolve(true),
}));

const databaseUrl = process.env.CANOPY_TEST_WEB_DATABASE_URL;
const describeWithDb = databaseUrl ? describe : describe.skip;
const password = 'integration passphrase';

describeWithDb('access (integration)', () => {
  let adminId: string;
  let memberId: string;

  beforeAll(async () => {
    process.env.CANOPY_DATABASE_URL = databaseUrl;
    process.env.CANOPY_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    await runMigrations();
    await getConnection().sql`DELETE FROM auth.users`;
    await getConnection().sql`DELETE FROM auth.groups`;
    ({ id: adminId } = await createAccount({ username: 'root', password, roleKeys: ['admin'] }));
    ({ id: memberId } = await createAccount({ username: 'member', password, roleKeys: [] }));
  });

  afterAll(async () => {
    await getConnection().sql`DELETE FROM auth.users`;
    await getConnection().sql`DELETE FROM auth.groups`;
    await getConnection().sql.end();
  });

  it('gives the admin role every declared permission', async () => {
    expect(await loadPermissions(adminId)).toContain('system:admin');
    expect(await loadPermissions(memberId)).toEqual([]);
    expect(await activeAdminIds()).toEqual([adminId]);
  });

  it('grants group roles and group 2FA requirements to members', async () => {
    const [viewer] = await getDb()
      .select({ id: rolesTable.id })
      .from(rolesTable)
      .where(eq(rolesTable.key, 'editor'));
    const [group] = await getDb()
      .insert(groupsTable)
      .values({ name: 'Family', requireTwoFactor: true })
      .returning({ id: groupsTable.id });
    if (!viewer || !group) throw new Error('fixtures missing');
    await getDb().insert(groupRolesTable).values({ groupId: group.id, roleId: viewer.id });
    await getDb().insert(groupMembersTable).values({ groupId: group.id, userId: memberId });

    expect(await loadPermissions(memberId)).toEqual(['system:read']);
    expect(await groupsRequireTwoFactor(memberId)).toBe(true);
    expect(await groupsRequireTwoFactor(adminId)).toBe(false);
  });

  it('rolls back any change that would leave no active administrator', async () => {
    await expect(
      withAdminGuard((tx) => tx.delete(userRolesTable).where(eq(userRolesTable.userId, adminId))),
    ).rejects.toMatchObject({ code: 'users.last_admin' });
    expect(await activeAdminIds()).toEqual([adminId]);
  });
});
