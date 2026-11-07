'use server';

import { randomBytes } from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import { getLocale } from 'next-intl/server';
import type { z } from 'zod';

import { getDb } from '@/shared/db/client';
import { runAction, type ActionResult } from '@/shared/lib/action';
import { AppBaseError } from '@/shared/lib/errors';
import { audit } from '@/features/audit/server/audit-writer';
import { authorize, getConfiguredAuth } from '@/features/auth';
import { accountsTable, sessionsTable, usersTable } from '@/features/auth/server/auth.schema';
import { issueActionToken } from '@/features/auth/server/action-tokens';
import { createAccount } from '@/features/auth/server/create-account';
import { hashPassword } from '@/features/auth/server/password';
import { assertPasswordAllowed } from '@/features/auth/server/password-policy';
import { notifySecurity } from '@/features/auth/server/security-notices';
import { removeFactor } from '@/features/auth/server/totp-factor';
import { sendMail } from '@/features/mail/server/mailer';
import { invitationEmail, passwordResetEmail } from '@/features/mail/templates/templates';

import {
  createUserSchema,
  editUserSchema,
  inviteUserSchema,
  removesLastAdmin,
  resetPasswordSchema,
  userTargetSchema,
} from '../users.utils';
import { activeAdminIds } from '@/features/access/server/admin-guard';
import { pathGrantsTable } from '@/features/files/server/files.schema';

import { collectPersonalData, deletePersonalLeftovers } from './personal-data';
import { rolesGrantAdmin, setUserRoles } from './users-store';

const adminLinkLifetimeMs = 24 * 60 * 60 * 1000;

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new AppBaseError('system.bad_request', 'invalid input');
  return parsed.data;
}

/** Refuses changes that would leave Canopy without an active administrator. */
async function assertKeepsAnAdmin(userId: string): Promise<void> {
  if (removesLastAdmin(await activeAdminIds(), userId)) {
    throw new AppBaseError('users.last_admin', 'cannot remove the last administrator');
  }
}

function assertNotSelf(actorId: string, userId: string): void {
  if (actorId === userId) {
    throw new AppBaseError('users.not_on_self', 'use the account page for your own account');
  }
}

async function endSessions(userId: string): Promise<void> {
  await getDb().delete(sessionsTable).where(eq(sessionsTable.userId, userId));
}

/** `link` is set when the invitation could not be emailed: the admin shares it instead. */
export async function createUser(
  input: unknown,
): Promise<ActionResult<{ id: string; link: string | null }>> {
  return runAction(async () => {
    const { user: actor } = await authorize('users:create');
    const { policy } = await getConfiguredAuth();
    const invited = inviteUserSchema.safeParse(input);
    const draft = invited.success
      ? { ...invited.data, password: randomBytes(32).toString('base64url') }
      : parse(createUserSchema(policy.passwordMinLength), input);
    if (!invited.success) await assertPasswordAllowed(draft.password, policy);
    const { id } = await createAccount({ ...draft, roleKeys: [] });
    await setUserRoles(id, draft.roleIds);
    await audit({
      action: invited.success ? 'users.invite' : 'users.create',
      result: 'success',
      actorId: actor.id,
      target: id,
      meta: { username: draft.username, roleIds: draft.roleIds },
    });
    if (!invited.success) return { id, link: null };
    const { link } = await issueActionToken(id, 'invitation');
    const email = await invitationEmail(await getLocale(), {
      name: draft.displayName ?? draft.username,
      link,
    });
    const outcome = await sendMail({ kind: 'invitation', to: invited.data.contactEmail, ...email });
    return { id, link: outcome.ok ? null : link };
  });
}

/** Emails a reset link when possible, otherwise returns it for the admin to share. */
export async function sendUserResetLink(
  input: unknown,
): Promise<ActionResult<{ link: string | null }>> {
  return runAction(async () => {
    const { user: actor } = await authorize('users:update');
    const { userId } = parse(userTargetSchema, input);
    assertNotSelf(actor.id, userId);
    const [target] = await getDb()
      .select({ name: usersTable.name, email: usersTable.contactEmail, locale: usersTable.locale })
      .from(usersTable)
      .where(eq(usersTable.id, userId));
    if (!target) throw new AppBaseError('system.not_found', 'user not found');
    // Longer than a self-service reset: the admin may relay it by another channel.
    const { link } = await issueActionToken(userId, 'password_reset', adminLinkLifetimeMs);
    let emailed = false;
    if (target.email) {
      const email = await passwordResetEmail(target.locale ?? (await getLocale()), {
        name: target.name,
        link,
      });
      emailed = (await sendMail({ kind: 'password_reset', to: target.email, ...email })).ok;
    }
    await audit({
      action: 'users.reset_link',
      result: 'success',
      actorId: actor.id,
      target: userId,
      meta: { emailed },
    });
    return { link: emailed ? null : link };
  });
}

export async function updateUser(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { user: actor } = await authorize('users:update');
    const { userId, displayName, contactEmail, roleIds } = parse(editUserSchema, input);
    if (!(await rolesGrantAdmin(roleIds))) await assertKeepsAnAdmin(userId);
    await getDb()
      .update(usersTable)
      .set({ name: displayName, contactEmail, updatedAt: new Date() })
      .where(eq(usersTable.id, userId));
    await setUserRoles(userId, roleIds);
    await audit({
      action: 'users.update',
      result: 'success',
      actorId: actor.id,
      target: userId,
      meta: { fields: ['displayName', 'contactEmail'], roleIds },
    });
    return null;
  });
}

/** Disabling ends every session of the user at once. */
export async function setUserDisabled(
  input: unknown,
  disabled: boolean,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { user: actor } = await authorize('users:update');
    const { userId } = parse(userTargetSchema, input);
    assertNotSelf(actor.id, userId);
    if (disabled) await assertKeepsAnAdmin(userId);
    await getDb()
      .update(usersTable)
      .set({ disabled, updatedAt: new Date() })
      .where(eq(usersTable.id, userId));
    if (disabled) await endSessions(userId);
    await audit({
      action: disabled ? 'users.disable' : 'users.enable',
      result: 'success',
      actorId: actor.id,
      target: userId,
    });
    return null;
  });
}

export async function deleteUser(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { user: actor } = await authorize('users:delete');
    const { userId } = parse(userTargetSchema, input);
    assertNotSelf(actor.id, userId);
    await assertKeepsAnAdmin(userId);
    const [target] = await getDb()
      .select({ email: usersTable.contactEmail })
      .from(usersTable)
      .where(eq(usersTable.id, userId));
    // Sessions, credentials, roles, memberships and 2FA rows cascade; grants and sent emails live
    // in `app`. Audit entries stay (pseudonymous id), until their retention expires.
    await getDb().transaction(async (tx) => {
      await deletePersonalLeftovers(tx, target?.email ?? null);
      await tx
        .delete(pathGrantsTable)
        .where(and(eq(pathGrantsTable.subjectType, 'user'), eq(pathGrantsTable.subjectId, userId)));
      await tx.delete(usersTable).where(eq(usersTable.id, userId));
    });
    await audit({ action: 'users.delete', result: 'success', actorId: actor.id, target: userId });
    return null;
  });
}

/** Sets a new password and signs the user out everywhere. */
export async function resetUserPassword(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { user: actor } = await authorize('users:update');
    const { policy } = await getConfiguredAuth();
    const { userId, password } = parse(resetPasswordSchema(policy.passwordMinLength), input);
    assertNotSelf(actor.id, userId);
    await assertPasswordAllowed(password, policy);
    await getDb()
      .update(accountsTable)
      .set({ password: await hashPassword(password), updatedAt: new Date() })
      .where(and(eq(accountsTable.userId, userId), eq(accountsTable.providerId, 'credential')));
    await endSessions(userId);
    await audit({
      action: 'users.password_reset',
      result: 'success',
      actorId: actor.id,
      target: userId,
    });
    await notifySecurity(userId, 'password_changed');
    return null;
  });
}

export async function revokeUserSessions(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { user: actor } = await authorize('users:update');
    const { userId } = parse(userTargetSchema, input);
    assertNotSelf(actor.id, userId);
    await endSessions(userId);
    await audit({
      action: 'users.sessions_revoke',
      result: 'success',
      actorId: actor.id,
      target: userId,
    });
    return null;
  });
}

/** For a lost phone: removes the authenticator and recovery codes, ends sessions. */
export async function resetUserTwoFactor(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { user: actor } = await authorize('users:update');
    const { userId } = parse(userTargetSchema, input);
    assertNotSelf(actor.id, userId);
    await removeFactor(userId);
    await endSessions(userId);
    await audit({
      action: 'users.two_factor_reset',
      result: 'success',
      actorId: actor.id,
      target: userId,
    });
    await notifySecurity(userId, 'two_factor_disabled');
    return null;
  });
}

/** RGPD access right, on behalf of a user: a JSON of everything stored about them. */
export async function exportUserData(input: unknown): Promise<ActionResult<{ json: string }>> {
  return runAction(async () => {
    const { user: actor } = await authorize('users:update');
    const { userId } = parse(userTargetSchema, input);
    const data = await collectPersonalData(userId);
    if (!data) throw new AppBaseError('system.not_found', 'user not found');
    await audit({
      action: 'users.data_export',
      result: 'success',
      actorId: actor.id,
      target: userId,
    });
    return { json: JSON.stringify(data, null, 2) };
  });
}
