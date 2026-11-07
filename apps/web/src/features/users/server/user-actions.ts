'use server';

import { and, eq } from 'drizzle-orm';
import type { z } from 'zod';

import { getDb } from '@/shared/db/client';
import { runAction, type ActionResult } from '@/shared/lib/action';
import { AppBaseError } from '@/shared/lib/errors';
import { audit } from '@/features/audit/server/audit-writer';
import { authorize, getConfiguredAuth } from '@/features/auth';
import { accountsTable, sessionsTable, usersTable } from '@/features/auth/server/auth.schema';
import { createAccount } from '@/features/auth/server/create-account';
import { hashPassword } from '@/features/auth/server/password';
import { assertPasswordAllowed } from '@/features/auth/server/password-policy';
import { removeFactor } from '@/features/auth/server/totp-factor';

import {
  createUserSchema,
  editUserSchema,
  removesLastAdmin,
  resetPasswordSchema,
  userTargetSchema,
} from '../users.utils';
import { activeAdminIds } from '@/features/access/server/admin-guard';
import { pathGrantsTable } from '@/features/files/server/files.schema';

import { rolesGrantAdmin, setUserRoles } from './users-store';

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

export async function createUser(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const { user: actor } = await authorize('users:create');
    const { policy } = await getConfiguredAuth();
    const draft = parse(createUserSchema(policy.passwordMinLength), input);
    await assertPasswordAllowed(draft.password, policy);
    const { id } = await createAccount({ ...draft, roleKeys: [] });
    await setUserRoles(id, draft.roleIds);
    await audit({
      action: 'users.create',
      result: 'success',
      actorId: actor.id,
      target: id,
      meta: { username: draft.username, roleIds: draft.roleIds },
    });
    return { id };
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
    // Sessions, credentials, roles, memberships and 2FA rows cascade; grants live in `app`.
    await getDb().transaction(async (tx) => {
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
    return null;
  });
}
