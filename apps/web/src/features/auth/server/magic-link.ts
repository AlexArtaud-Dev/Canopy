'use server';

import { eq, or, sql } from 'drizzle-orm';
import { isAPIError } from 'better-auth/api';

import { getDb } from '@/shared/db/client';
import { runAction, type ActionResult } from '@/shared/lib/action';
import { AppBaseError } from '@/shared/lib/errors';
import { enforceRateLimit } from '@/shared/rate-limit/rate-limit';
import { getRequestContext } from '@/shared/request/request-context';
import { groupsAllowMagicLink } from '@/features/access/server/permissions';
import { audit } from '@/features/audit/server/audit-writer';

import { magicLinkRequestSchema, magicLinkSignInSchema } from '../auth.utils';
import { sessionsTable, usersTable } from './auth.schema';
import { authRequestHeaders, getConfiguredAuth } from './current-session';
import { assertAddressAllowed } from './ip-block';
import { isMagicLinkAvailable } from './magic-link-service';
import { completeSignIn } from './sign-in-completion';

const requestRule = { limit: 5, windowSeconds: 15 * 60 };
const signInRule = { limit: 10, windowSeconds: 60 };

async function limitByAddress(scope: string, rule: { limit: number; windowSeconds: number }) {
  const { clientIp } = await getRequestContext();
  await enforceRateLimit(scope, clientIp ?? 'unknown', rule);
}

/**
 * Sends a sign-in link when the account exists, is enabled, has an e-mail address and belongs to
 * a group that allows sign-in links. The answer never says whether it did, so the form cannot be
 * used to probe accounts.
 */
export async function requestMagicLink(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const parsed = magicLinkRequestSchema.safeParse(input);
    if (!parsed.success) throw new AppBaseError('system.bad_request', 'invalid identifier');
    await limitByAddress('auth.magic_link_request', requestRule);
    if (!(await isMagicLinkAvailable())) throw new AppBaseError('auth.magic_link_off', 'off');
    const identifier = parsed.data.identifier.toLowerCase();
    const [user] = await getDb()
      .select({
        id: usersTable.id,
        email: usersTable.email,
        contactEmail: usersTable.contactEmail,
        disabled: usersTable.disabled,
      })
      .from(usersTable)
      .where(
        or(
          eq(usersTable.username, identifier),
          eq(sql`lower(${usersTable.contactEmail})`, identifier),
        ),
      )
      .limit(1);
    const eligible =
      user?.contactEmail && !user.disabled && (await groupsAllowMagicLink(user.id)) ? user : null;
    if (eligible) {
      const [{ auth }, headers] = await Promise.all([getConfiguredAuth(), authRequestHeaders()]);
      // Better Auth keys the link on the account's internal address; the e-mail itself goes to
      // the contact address (see `deliverMagicLink`).
      await auth.api.signInMagicLink({
        body: { email: eligible.email, metadata: { userId: eligible.id } },
        headers,
      });
    }
    await audit({
      action: 'auth.magic_link_request',
      result: eligible ? 'success' : 'denied',
      actorId: eligible?.id ?? null,
    });
    return null;
  });
}

/** Signs in with a link from the e-mail; the link works once. */
export async function signInWithMagicLink(
  input: unknown,
): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction(async () => {
    const parsed = magicLinkSignInSchema.safeParse(input);
    if (!parsed.success) throw new AppBaseError('auth.link_invalid', 'malformed link');
    await limitByAddress('auth.magic_link_sign_in', signInRule);
    const [{ auth, policy }, headers] = await Promise.all([
      getConfiguredAuth(),
      authRequestHeaders(),
    ]);
    await assertAddressAllowed(policy);

    let signedIn: { token: string; user: { id: string } };
    try {
      signedIn = await auth.api.magicLinkVerify({ query: { token: parsed.data.token }, headers });
    } catch (error) {
      if (!isAPIError(error)) throw error;
      await audit({ action: 'auth.sign_in', result: 'denied', meta: { method: 'magic_link' } });
      throw new AppBaseError('auth.link_invalid', 'link invalid, used or expired', {
        cause: error,
      });
    }
    // The group may have stopped allowing links since the e-mail left: undo the new session.
    if (!(await groupsAllowMagicLink(signedIn.user.id))) {
      await getDb().delete(sessionsTable).where(eq(sessionsTable.token, signedIn.token));
      await audit({
        action: 'auth.sign_in',
        result: 'denied',
        actorId: signedIn.user.id,
        meta: { method: 'magic_link', reason: 'not_allowed' },
      });
      throw new AppBaseError('auth.link_invalid', 'sign-in links no longer allowed');
    }
    return completeSignIn(signedIn.user.id, parsed.data.next, {
      method: 'magic_link',
      notifyNewSignIn: policy.notifyNewSignIn,
    });
  });
}
