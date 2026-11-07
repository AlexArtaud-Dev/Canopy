'use server';

import { and, eq, inArray } from 'drizzle-orm';
import type { z } from 'zod';

import { appRegistry } from '@/modules';
import { getDb } from '@/shared/db/client';
import { runAction, type ActionResult } from '@/shared/lib/action';
import { AppBaseError } from '@/shared/lib/errors';
import { audit } from '@/features/audit/server/audit-writer';
import { authorize } from '@/features/auth';
import { usersTable } from '@/features/auth/server/auth.schema';

import {
  entityIdSchema,
  groupInputSchema,
  groupMembersInputSchema,
  roleInputSchema,
  sanitizeRolePermissions,
} from '../access.utils';
import { groupMembersTable, groupRolesTable, groupsTable, rolesTable } from './access.schema';
import { withAdminGuard } from './admin-guard';
import { roleKey } from './access-store';

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new AppBaseError('system.bad_request', 'invalid input');
  return parsed.data;
}

/** Postgres unique violation → a translated "name taken" error. */
function isUniqueViolation(error: unknown): boolean {
  const cause = error instanceof Error && 'cause' in error ? error.cause : error;
  return typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === '23505';
}

async function nameTaken<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (isUniqueViolation(error)) throw new AppBaseError('access.name_taken', 'name exists');
    throw error;
  }
}

export async function saveRole(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const draft = parse(roleInputSchema, input);
    const { user } = await authorize(draft.roleId ? 'roles:update' : 'roles:create');
    const permissions = sanitizeRolePermissions(draft.permissions, appRegistry.globalPermissions);
    const key = draft.roleId ? await roleKey(draft.roleId) : null;
    if (key === undefined) throw new AppBaseError('system.not_found', 'role not found');

    const id = await nameTaken(() =>
      withAdminGuard(async (tx) => {
        if (draft.roleId) {
          await tx
            .update(rolesTable)
            // Built-in roles keep their name: it is shown translated from their key.
            .set({
              ...(key ? {} : { name: draft.name }),
              description: draft.description,
              permissions,
              updatedAt: new Date(),
            })
            .where(eq(rolesTable.id, draft.roleId));
          return draft.roleId;
        }
        const [created] = await tx
          .insert(rolesTable)
          .values({ name: draft.name, description: draft.description, permissions })
          .returning({ id: rolesTable.id });
        if (!created) throw new Error('role insert returned no row');
        return created.id;
      }),
    );
    await audit({
      action: draft.roleId ? 'roles.update' : 'roles.create',
      result: 'success',
      actorId: user.id,
      target: id,
      meta: { name: draft.name, permissions },
    });
    return { id };
  });
}

export async function deleteRole(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { id } = parse(entityIdSchema, input);
    const { user } = await authorize('roles:delete');
    const key = await roleKey(id);
    if (key === undefined) throw new AppBaseError('system.not_found', 'role not found');
    if (key) throw new AppBaseError('access.built_in_role', 'built-in roles cannot be deleted');
    await withAdminGuard((tx) => tx.delete(rolesTable).where(eq(rolesTable.id, id)));
    await audit({ action: 'roles.delete', result: 'success', actorId: user.id, target: id });
    return null;
  });
}

export async function saveGroup(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const draft = parse(groupInputSchema, input);
    const { user } = await authorize(draft.groupId ? 'groups:update' : 'groups:create');

    const id = await nameTaken(() =>
      withAdminGuard(async (tx) => {
        const values = {
          name: draft.name,
          description: draft.description,
          requireTwoFactor: draft.requireTwoFactor,
        };
        let groupId = draft.groupId;
        if (groupId) {
          await tx
            .update(groupsTable)
            .set({ ...values, updatedAt: new Date() })
            .where(eq(groupsTable.id, groupId));
        } else {
          const [created] = await tx
            .insert(groupsTable)
            .values(values)
            .returning({ id: groupsTable.id });
          if (!created) throw new Error('group insert returned no row');
          groupId = created.id;
        }
        const target = groupId;
        await tx.delete(groupRolesTable).where(eq(groupRolesTable.groupId, target));
        const roles = draft.roleIds.length
          ? await tx
              .select({ id: rolesTable.id })
              .from(rolesTable)
              .where(inArray(rolesTable.id, draft.roleIds))
          : [];
        if (roles.length) {
          await tx
            .insert(groupRolesTable)
            .values(roles.map((role) => ({ groupId: target, roleId: role.id })));
        }
        return target;
      }),
    );
    await audit({
      action: draft.groupId ? 'groups.update' : 'groups.create',
      result: 'success',
      actorId: user.id,
      target: id,
      meta: {
        name: draft.name,
        requireTwoFactor: draft.requireTwoFactor,
        roleIds: draft.roleIds,
      },
    });
    return { id };
  });
}

export async function deleteGroup(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { id } = parse(entityIdSchema, input);
    const { user } = await authorize('groups:delete');
    await withAdminGuard((tx) => tx.delete(groupsTable).where(eq(groupsTable.id, id)));
    await audit({ action: 'groups.delete', result: 'success', actorId: user.id, target: id });
    return null;
  });
}

export async function addGroupMembers(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { groupId, userIds } = parse(groupMembersInputSchema, input);
    const { user } = await authorize('groups:update');
    const existing = await getDb()
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(inArray(usersTable.id, userIds));
    if (existing.length > 0) {
      await getDb()
        .insert(groupMembersTable)
        .values(existing.map((member) => ({ groupId, userId: member.id })))
        .onConflictDoNothing();
    }
    await audit({
      action: 'groups.members_add',
      result: 'success',
      actorId: user.id,
      target: groupId,
      meta: { userIds: existing.map((member) => member.id) },
    });
    return null;
  });
}

export async function removeGroupMember(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { groupId, userIds } = parse(groupMembersInputSchema, input);
    const { user } = await authorize('groups:update');
    // Leaving a group can drop admin rights: never below one active administrator.
    await withAdminGuard((tx) =>
      tx
        .delete(groupMembersTable)
        .where(
          and(eq(groupMembersTable.groupId, groupId), inArray(groupMembersTable.userId, userIds)),
        ),
    );
    await audit({
      action: 'groups.members_remove',
      result: 'success',
      actorId: user.id,
      target: groupId,
      meta: { userIds },
    });
    return null;
  });
}
