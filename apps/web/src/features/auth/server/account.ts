'use server';

import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { getDb } from '@/shared/db/client';
import { runAction, type ActionResult } from '@/shared/lib/action';
import { AppBaseError } from '@/shared/lib/errors';
import { audit } from '@/features/audit/server/audit-writer';

import { changePasswordSchema, profileSchema } from '../account.utils';
import { accountsTable, usersTable } from './auth.schema';
import { deleteOtherSessions, deleteSession } from './account-sessions';
import { getConfiguredAuth, requireSession } from './current-session';
import { hashPassword } from './password';
import { assertPasswordAllowed } from './password-policy';
import { assertCurrentPassword } from './reauthenticate';
import { notifySecurity } from './security-notices';

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new AppBaseError('system.bad_request', 'invalid input');
  return parsed.data;
}

export async function updateProfile(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { displayName, contactEmail } = parse(profileSchema, input);
    const { user } = await requireSession();
    await getDb()
      .update(usersTable)
      .set({ name: displayName, contactEmail, updatedAt: new Date() })
      .where(eq(usersTable.id, user.id));
    // Field names only: the values are personal data.
    await audit({
      action: 'auth.profile_update',
      result: 'success',
      actorId: user.id,
      meta: { fields: ['displayName', 'contactEmail'] },
    });
    return null;
  });
}

/** Changes the password and signs out every other device. */
export async function changePassword(
  input: unknown,
): Promise<ActionResult<{ endedSessions: number }>> {
  return runAction(async () => {
    const { user, sessionId } = await requireSession();
    const { policy } = await getConfiguredAuth();
    const { currentPassword, newPassword } = parse(
      changePasswordSchema(policy.passwordMinLength),
      input,
    );
    await assertCurrentPassword(user.id, currentPassword);
    await assertPasswordAllowed(newPassword, policy);
    await getDb()
      .update(accountsTable)
      .set({ password: await hashPassword(newPassword), updatedAt: new Date() })
      .where(and(eq(accountsTable.userId, user.id), eq(accountsTable.providerId, 'credential')));
    const endedSessions = await deleteOtherSessions(user.id, sessionId);
    await audit({
      action: 'auth.password_change',
      result: 'success',
      actorId: user.id,
      meta: { endedSessions },
    });
    await notifySecurity(user.id, 'password_changed');
    return { endedSessions };
  });
}

const sessionInput = z.object({ sessionId: z.string().min(1).max(64) });

export async function revokeSession(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { sessionId: target } = parse(sessionInput, input);
    const { user, sessionId } = await requireSession();
    if (target === sessionId) {
      throw new AppBaseError('auth.cannot_revoke_current', 'use sign out for this device');
    }
    if (!(await deleteSession(user.id, target))) {
      throw new AppBaseError('system.not_found', 'session not found');
    }
    await audit({ action: 'auth.session_revoke', result: 'success', actorId: user.id, target });
    return null;
  });
}

export async function revokeOtherSessions(): Promise<ActionResult<{ endedSessions: number }>> {
  return runAction(async () => {
    const { user, sessionId } = await requireSession();
    const endedSessions = await deleteOtherSessions(user.id, sessionId);
    await audit({
      action: 'auth.session_revoke',
      result: 'success',
      actorId: user.id,
      meta: { scope: 'others', endedSessions },
    });
    return { endedSessions };
  });
}
