/**
 * @jest-environment node
 */
// Runs only against a disposable database: CANOPY_TEST_WEB_DATABASE_URL (canopy_web role).
import { randomBytes } from 'node:crypto';

import { getConnection } from '@/shared/db/client';
import { runMigrations } from '@/shared/db/migrate';
import type { AppBaseError } from '@/shared/lib/errors';

import { createAccount } from './create-account';
import { getConfiguredAuth, getCurrentSession, hasAnyUser, setupBlocker } from './current-session';

let requestHeaders = new Headers();

jest.mock('server-only', () => ({}));
jest.mock('next/headers', () => ({
  headers: () => Promise.resolve(requestHeaders),
  cookies: () => Promise.resolve({ set: jest.fn(), get: jest.fn() }),
}));
jest.mock('@/shared/request/request-context', () => ({
  getRequestContext: () =>
    Promise.resolve({
      requestId: 'itest',
      clientIp: '192.168.1.20',
      logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
    }),
  isLocalRequest: () => Promise.resolve(true),
}));

const databaseUrl = process.env.CANOPY_TEST_WEB_DATABASE_URL;
const describeWithDb = databaseUrl ? describe : describe.skip;
const password = 'integration passphrase';

async function signIn(username: string): Promise<string> {
  const { auth } = await getConfiguredAuth();
  const { headers } = await auth.api.signInUsername({
    body: { username, password },
    headers: new Headers(),
    returnHeaders: true,
  });
  const cookie = headers.get('set-cookie')?.split(';')[0];
  if (!cookie) throw new Error('no session cookie');
  return cookie;
}

describeWithDb('auth (integration)', () => {
  beforeAll(async () => {
    process.env.CANOPY_DATABASE_URL = databaseUrl;
    process.env.CANOPY_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    await runMigrations();
    await getConnection().sql`DELETE FROM auth.users`;
  });

  afterAll(async () => {
    await getConnection().sql`DELETE FROM auth.users`;
    await getConnection().sql.end();
  });

  it('only offers the setup wizard while no account exists', async () => {
    expect(await hasAnyUser()).toBe(false);
    expect(await setupBlocker()).toBeNull();
  });

  it('creates a local account with an argon2id credential and a synthetic login email', async () => {
    const { id } = await createAccount({ username: 'Ada', password, isAdmin: true });
    const [row] = await getConnection().sql<
      { username: string; display_username: string; email: string; hash: string }[]
    >`SELECT u.username, u.display_username, u.email, a.password AS hash
      FROM auth.users u JOIN auth.accounts a ON a.user_id = u.id WHERE u.id = ${id}`;
    expect(row?.username).toBe('ada');
    expect(row?.display_username).toBe('Ada');
    expect(row?.email).toMatch(/@users\.canopy\.invalid$/);
    expect(row?.hash).toMatch(/^\$argon2id\$/);
    expect(await setupBlocker()).toBe('already_done');
  });

  it('rejects a username that is already taken, whatever its case', async () => {
    await expect(createAccount({ username: 'ADA', password, isAdmin: false })).rejects.toEqual(
      expect.objectContaining<Partial<AppBaseError>>({ code: 'auth.username_taken' }),
    );
  });

  it('signs in and resolves the session from its cookie', async () => {
    requestHeaders = new Headers({ cookie: await signIn('ada') });
    const session = await getCurrentSession();
    expect(session?.user).toEqual(
      expect.objectContaining({ username: 'ada', name: 'Ada', isAdmin: true, contactEmail: null }),
    );
  });

  it('rejects a wrong password', async () => {
    const { auth } = await getConfiguredAuth();
    await expect(
      auth.api.signInUsername({
        body: { username: 'ada', password: 'wrong' },
        headers: new Headers(),
      }),
    ).rejects.toThrow();
  });

  it('ends a session left idle past the timeout and deletes it', async () => {
    requestHeaders = new Headers({ cookie: await signIn('ada') });
    const session = await getCurrentSession();
    if (!session) throw new Error('expected a session');
    await getConnection().sql`
      UPDATE auth.sessions SET updated_at = now() - interval '8 days' WHERE id = ${session.sessionId}`;

    expect(await getCurrentSession()).toBeNull();
    const rows = await getConnection()
      .sql`SELECT 1 FROM auth.sessions WHERE id = ${session.sessionId}`;
    expect(rows).toHaveLength(0);
  });

  it('treats a missing or forged cookie as signed out', async () => {
    requestHeaders = new Headers();
    expect(await getCurrentSession()).toBeNull();
    requestHeaders = new Headers({ cookie: 'canopy.session_token=forged.value' });
    expect(await getCurrentSession()).toBeNull();
  });
});
