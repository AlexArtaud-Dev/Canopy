import 'server-only';

import { and, eq, lt, sql } from 'drizzle-orm';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';

import { getDb } from '@/shared/db/client';
import { getRequestContext, isLocalRequest } from '@/shared/request/request-context';
import { getSettings } from '@/features/settings/server/settings-store';

import { authSettings } from '../auth.settings';
import { activityGranularitySeconds, evaluateSession } from '../auth.utils';
import { getAuth, clientIpHeader, type Auth } from './auth';
import { sessionsTable, usersTable } from './auth.schema';

export interface SessionUser {
  id: string;
  username: string;
  name: string;
  contactEmail: string | null;
  isAdmin: boolean;
}

export interface CurrentSession {
  sessionId: string;
  user: SessionUser;
}

/** Better Auth configured from the current settings, plus those settings. */
export async function getConfiguredAuth() {
  const { values } = await getSettings('auth', authSettings);
  return { auth: getAuth(values.sessionLifetimeDays * 24 * 60 * 60), policy: values };
}

/** Incoming headers with our resolved client IP, the only one Better Auth may record. */
export async function authRequestHeaders(): Promise<Headers> {
  const [incoming, context] = await Promise.all([headers(), getRequestContext()]);
  const forwarded = new Headers(incoming);
  forwarded.delete(clientIpHeader);
  if (context.clientIp) forwarded.set(clientIpHeader, context.clientIp);
  return forwarded;
}

async function recordActivity(sessionId: string): Promise<void> {
  await getDb()
    .update(sessionsTable)
    .set({ updatedAt: sql`now()` })
    .where(
      and(
        eq(sessionsTable.id, sessionId),
        lt(
          sessionsTable.updatedAt,
          sql`now() - make_interval(secs => ${activityGranularitySeconds})`,
        ),
      ),
    );
}

async function readSession(auth: Auth, requestHeaders: Headers) {
  try {
    return await auth.api.getSession({ headers: requestHeaders });
  } catch {
    // A tampered or stale cookie is simply "signed out".
    return null;
  }
}

/** The signed-in user for this request, or null. Memoized per request. */
export const getCurrentSession = cache(async (): Promise<CurrentSession | null> => {
  const [{ auth, policy }, requestHeaders] = await Promise.all([
    getConfiguredAuth(),
    authRequestHeaders(),
  ]);
  const result = await readSession(auth, requestHeaders);
  if (!result) return null;

  const verdict = evaluateSession(
    {
      createdAt: new Date(result.session.createdAt),
      updatedAt: new Date(result.session.updatedAt),
    },
    policy,
    new Date(),
  );
  if (verdict !== 'active') {
    await getDb().delete(sessionsTable).where(eq(sessionsTable.id, result.session.id));
    return null;
  }
  await recordActivity(result.session.id);

  const { user } = result;
  return {
    sessionId: result.session.id,
    user: {
      id: user.id,
      username: user.username ?? '',
      name: user.name,
      contactEmail: user.contactEmail ?? null,
      isAdmin: user.isAdmin === true,
    },
  };
});

export async function hasAnyUser(): Promise<boolean> {
  const rows = await getDb().select({ id: usersTable.id }).from(usersTable).limit(1);
  return rows.length > 0;
}

/** Why the first-run wizard cannot run, or null when it can. */
export async function setupBlocker(): Promise<'already_done' | 'not_local' | null> {
  if (await hasAnyUser()) return 'already_done';
  if (!(await isLocalRequest())) return 'not_local';
  return null;
}

/**
 * Gate for every protected page, layout and server action: no session → login (or the setup
 * wizard when the instance has no account yet).
 */
export async function requireSession(): Promise<CurrentSession> {
  const session = await getCurrentSession();
  if (session) return session;
  redirect((await hasAnyUser()) ? '/login' : '/setup');
}
