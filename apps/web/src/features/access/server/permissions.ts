import 'server-only';

import { eq, inArray, or } from 'drizzle-orm';

import { appRegistry } from '@/modules';
import { getDb } from '@/shared/db/client';
import type { GlobalPermission } from '@/shared/modules/module.types';

import { effectivePermissions, twoFactorRequired } from '../access.utils';
import {
  groupMembersTable,
  groupRolesTable,
  groupsTable,
  rolesTable,
  userRolesTable,
} from './access.schema';

/** Global permissions of a user: roles assigned directly plus those of their groups. */
export async function loadPermissions(userId: string): Promise<GlobalPermission[]> {
  const db = getDb();
  const groupIds = db
    .select({ id: groupMembersTable.groupId })
    .from(groupMembersTable)
    .where(eq(groupMembersTable.userId, userId));
  const roles = await db
    .selectDistinct({ id: rolesTable.id, permissions: rolesTable.permissions })
    .from(rolesTable)
    .leftJoin(userRolesTable, eq(userRolesTable.roleId, rolesTable.id))
    .leftJoin(groupRolesTable, eq(groupRolesTable.roleId, rolesTable.id))
    .where(or(eq(userRolesTable.userId, userId), inArray(groupRolesTable.groupId, groupIds)));
  return effectivePermissions(roles, appRegistry.globalPermissions);
}

/** Gives a user the built-in roles named by `keys` (e.g. `admin` for the first account). */
export async function assignBuiltInRoles(userId: string, keys: readonly string[]): Promise<void> {
  if (keys.length === 0) return;
  const roles = await getDb()
    .select({ id: rolesTable.id })
    .from(rolesTable)
    .where(inArray(rolesTable.key, [...keys]));
  if (roles.length === 0) return;
  await getDb()
    .insert(userRolesTable)
    .values(roles.map((role) => ({ userId, roleId: role.id })))
    .onConflictDoNothing();
}

/** True when one of the user's groups requires two-factor authentication. */
export async function groupsRequireTwoFactor(userId: string): Promise<boolean> {
  const rows = await getDb()
    .select({ require: groupsTable.requireTwoFactor })
    .from(groupMembersTable)
    .innerJoin(groupsTable, eq(groupsTable.id, groupMembersTable.groupId))
    .where(eq(groupMembersTable.userId, userId));
  return twoFactorRequired(rows.map((row) => ({ requireTwoFactor: row.require })));
}

/** Ids of the user's groups (carried in engine tokens for group path grants). */
export async function loadGroupIds(userId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ id: groupMembersTable.groupId })
    .from(groupMembersTable)
    .where(eq(groupMembersTable.userId, userId));
  return rows.map((row) => row.id);
}
