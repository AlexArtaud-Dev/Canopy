import 'server-only';

import { and, eq, lt, sql } from 'drizzle-orm';
import { headers } from 'next/headers';
import { getLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { cache } from 'react';

import { getDb } from '@/shared/db/client';
import { getRequestContext, isLocalRequest } from '@/shared/request/request-context';
import { getSettings } from '@/features/settings/server/settings-store';
import { adminPermission } from '@/features/access/access.utils';
import { groupsRequireTwoFactor, loadPermissions } from '@/features/access/server/permissions';
import { hasTotpEnabled } from './totp-factor';
import type { GlobalPermission } from '@/shared/modules/module.types';

import { authSettings } from '../auth.settings';
import { activityGranularitySeconds, evaluateSession } from '../auth.utils';
import { getAuth, clientIpHeader, type Auth } from './auth';
import { sessionsTable, usersTable } from './auth.schema';

export interface SessionUser {
  id: string;
  username: string;
  name: string;
  contactEmail: string | null;
  /** Global permissions from roles (direct and through groups). */
  permissions: readonly GlobalPermission[];
  /** Holds `system:admin`. */
  isAdmin: boolean;
  /** A group requires 2FA and the user has not set it up yet. */
  twoFactorSetupRequired: boolean;
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

export type SessionState =
  | { kind: 'none' }
  | { kind: 'pending'; sessionId: string; userId: string }
  | ({ kind: 'active' } & CurrentSession);

/**
 * Session state from raw request headers (signed out, waiting for 2FA, or active). Used directly
 * by routes outside the App Router (the engine stream proxy); pages go through getSessionState.
 */
export async function resolveSession(
  requestHeaders: Headers,
): Promise<{ state: SessionState; locale: string | null }> {
  const { auth, policy } = await getConfiguredAuth();
  const result = await readSession(auth, requestHeaders);
  if (!result) return { state: { kind: 'none' }, locale: null };

  const verdict = evaluateSession(
    {
      createdAt: new Date(result.session.createdAt),
      updatedAt: new Date(result.session.updatedAt),
      twoFactorPending: result.session.twoFactorPending === true,
    },
    policy,
    new Date(),
  );
  if (verdict === 'expired' || verdict === 'idle') {
    await getDb().delete(sessionsTable).where(eq(sessionsTable.id, result.session.id));
    return { state: { kind: 'none' }, locale: null };
  }
  if (result.user.disabled === true) {
    // Disabling ends sessions, but never trust that alone.
    await getDb().delete(sessionsTable).where(eq(sessionsTable.id, result.session.id));
    return { state: { kind: 'none' }, locale: null };
  }
  if (verdict === 'pending') {
    return {
      state: { kind: 'pending', sessionId: result.session.id, userId: result.user.id },
      locale: null,
    };
  }
  const [permissions, groupRequires2fa, totpEnabled] = await Promise.all([
    loadPermissions(result.user.id),
    groupsRequireTwoFactor(result.user.id),
    hasTotpEnabled(result.user.id),
    recordActivity(result.session.id),
  ]);
  const { user } = result;
  return {
    locale: user.locale ?? null,
    state: {
      kind: 'active',
      sessionId: result.session.id,
      user: {
        id: user.id,
        username: user.username ?? '',
        name: user.name,
        contactEmail: user.contactEmail ?? null,
        permissions,
        isAdmin: permissions.includes(adminPermission),
        twoFactorSetupRequired: groupRequires2fa && !totpEnabled,
      },
    },
  };
}

/** Session state for this request (signed out, waiting for 2FA, or active). Memoized. */
export const getSessionState = cache(async (): Promise<SessionState> => {
  const { state, locale } = await resolveSession(await authRequestHeaders());
  if (state.kind === 'active') await rememberLocale(state.user.id, locale);
  return state;
});

/** Keeps the user's last UI language so emails use it (written only when it changes). */
async function rememberLocale(userId: string, stored: string | null): Promise<void> {
  const locale = await getLocale();
  if (locale === stored) return;
  await getDb().update(usersTable).set({ locale }).where(eq(usersTable.id, userId));
}

/** The fully signed-in user for this request, or null (a pending 2FA session counts as none). */
export async function getCurrentSession(): Promise<CurrentSession | null> {
  const state = await getSessionState();
  return state.kind === 'active' ? { sessionId: state.sessionId, user: state.user } : null;
}

/** Marks a pending session as fully authenticated once its second factor is verified. */
export async function completeSecondFactor(sessionId: string): Promise<void> {
  await getDb()
    .update(sessionsTable)
    .set({ twoFactorPending: false, updatedAt: sql`now()` })
    .where(eq(sessionsTable.id, sessionId));
}

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
export async function requireSession(
  options: { allowTwoFactorSetup?: boolean } = {},
): Promise<CurrentSession> {
  const state = await getSessionState();
  if (state.kind === 'active') {
    // A group demands 2FA: nothing else is reachable until it is set up.
    if (state.user.twoFactorSetupRequired && !options.allowTwoFactorSetup) {
      redirect('/two-factor/setup');
    }
    return { sessionId: state.sessionId, user: state.user };
  }
  if (state.kind === 'pending') redirect('/login/verify');
  redirect((await hasAnyUser()) ? '/login' : '/setup');
}
