import 'server-only';

import { and, asc, eq, inArray } from 'drizzle-orm';

import { appRegistry } from '@/modules';
import { getDb } from '@/shared/db/client';
import { pathGrantsTable } from '@/features/files/server/files.schema';

import { adminPermission, tracePermissions, type PermissionTrace } from '../access.utils';
import { isBuiltInRoleKey, type BuiltInRoleKey } from '../role-label';
import {
  groupMembersTable,
  groupRolesTable,
  groupsTable,
  rolesTable,
  userRolesTable,
} from './access.schema';

export interface InheritedGrant {
  id: string;
  groupId: string;
  groupName: string;
  path: string;
  actions: string[];
  effect: 'allow' | 'deny';
}

export interface UserAccessOverview {
  groups: { id: string; name: string }[];
  permissions: PermissionTrace[];
  isAdmin: boolean;
  inheritedGrants: InheritedGrant[];
}

/**
 * Where a user's access comes from: their roles (direct and through each group), the resulting
 * global permissions with their sources, and the folder rules inherited from groups.
 * `roleLabel` translates built-in role names.
 */
export async function getUserAccessOverview(
  userId: string,
  roleLabel: (key: BuiltInRoleKey) => string,
): Promise<UserAccessOverview> {
  const db = getDb();
  const groups = await db
    .select({ id: groupsTable.id, name: groupsTable.name })
    .from(groupMembersTable)
    .innerJoin(groupsTable, eq(groupsTable.id, groupMembersTable.groupId))
    .where(eq(groupMembersTable.userId, userId))
    .orderBy(asc(groupsTable.name));
  const groupIds = groups.map((group) => group.id);

  const [directRoles, groupRoles, inherited] = await Promise.all([
    db
      .select({ key: rolesTable.key, name: rolesTable.name, permissions: rolesTable.permissions })
      .from(userRolesTable)
      .innerJoin(rolesTable, eq(rolesTable.id, userRolesTable.roleId))
      .where(eq(userRolesTable.userId, userId)),
    groupIds.length
      ? db
          .select({
            groupName: groupsTable.name,
            key: rolesTable.key,
            name: rolesTable.name,
            permissions: rolesTable.permissions,
          })
          .from(groupRolesTable)
          .innerJoin(rolesTable, eq(rolesTable.id, groupRolesTable.roleId))
          .innerJoin(groupsTable, eq(groupsTable.id, groupRolesTable.groupId))
          .where(inArray(groupRolesTable.groupId, groupIds))
      : Promise.resolve([]),
    groupIds.length
      ? db
          .select({
            id: pathGrantsTable.id,
            groupId: pathGrantsTable.subjectId,
            path: pathGrantsTable.path,
            actions: pathGrantsTable.actions,
            effect: pathGrantsTable.effect,
          })
          .from(pathGrantsTable)
          .where(
            and(
              eq(pathGrantsTable.subjectType, 'group'),
              inArray(pathGrantsTable.subjectId, groupIds),
            ),
          )
          .orderBy(asc(pathGrantsTable.path))
      : Promise.resolve([]),
  ]);

  const name = (role: { key: string | null; name: string }) =>
    isBuiltInRoleKey(role.key) ? roleLabel(role.key) : role.name;
  const permissions = tracePermissions(
    [
      ...directRoles.map((role) => ({
        roleName: name(role),
        groupName: null,
        permissions: role.permissions,
      })),
      ...groupRoles.map((role) => ({
        roleName: name(role),
        groupName: role.groupName,
        permissions: role.permissions,
      })),
    ],
    appRegistry.globalPermissions,
  );
  const groupNames = new Map(groups.map((group) => [group.id, group.name]));

  return {
    groups,
    permissions,
    isAdmin: permissions.some((trace) => trace.permission === adminPermission),
    inheritedGrants: inherited.map((grant) => ({
      ...grant,
      groupName: groupNames.get(grant.groupId) ?? grant.groupId,
    })),
  };
}
