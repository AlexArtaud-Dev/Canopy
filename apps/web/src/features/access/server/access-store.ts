import 'server-only';

import { asc, count, eq } from 'drizzle-orm';

import { getDb } from '@/shared/db/client';
import { usersTable } from '@/features/auth/server/auth.schema';

import {
  groupMembersTable,
  groupRolesTable,
  groupsTable,
  rolesTable,
  userRolesTable,
} from './access.schema';

export interface RoleSummary {
  id: string;
  key: string | null;
  name: string;
  description: string;
  permissions: string[];
  userCount: number;
  groupCount: number;
}

export interface GroupSummary {
  id: string;
  name: string;
  description: string;
  requireTwoFactor: boolean;
  roleIds: string[];
  memberIds: string[];
}

export interface MemberOption {
  id: string;
  username: string;
  name: string;
}

export async function listRoles(): Promise<RoleSummary[]> {
  const db = getDb();
  const [roles, users, groups] = await Promise.all([
    db
      .select({
        id: rolesTable.id,
        key: rolesTable.key,
        name: rolesTable.name,
        description: rolesTable.description,
        permissions: rolesTable.permissions,
      })
      .from(rolesTable)
      .orderBy(asc(rolesTable.name)),
    db
      .select({ roleId: userRolesTable.roleId, total: count() })
      .from(userRolesTable)
      .groupBy(userRolesTable.roleId),
    db
      .select({ roleId: groupRolesTable.roleId, total: count() })
      .from(groupRolesTable)
      .groupBy(groupRolesTable.roleId),
  ]);
  const usersByRole = new Map(users.map((row) => [row.roleId, row.total]));
  const groupsByRole = new Map(groups.map((row) => [row.roleId, row.total]));
  return roles.map((role) => ({
    ...role,
    userCount: usersByRole.get(role.id) ?? 0,
    groupCount: groupsByRole.get(role.id) ?? 0,
  }));
}

export async function listGroups(): Promise<GroupSummary[]> {
  const db = getDb();
  const [groups, roles, members] = await Promise.all([
    db
      .select({
        id: groupsTable.id,
        name: groupsTable.name,
        description: groupsTable.description,
        requireTwoFactor: groupsTable.requireTwoFactor,
      })
      .from(groupsTable)
      .orderBy(asc(groupsTable.name)),
    db.select().from(groupRolesTable),
    db.select().from(groupMembersTable),
  ]);
  return groups.map((group) => ({
    ...group,
    roleIds: roles.filter((row) => row.groupId === group.id).map((row) => row.roleId),
    memberIds: members.filter((row) => row.groupId === group.id).map((row) => row.userId),
  }));
}

/** Every account, for the member picker (instances stay small enough for one list). */
export function listMemberOptions(): Promise<MemberOption[]> {
  return getDb()
    .select({ id: usersTable.id, username: usersTable.username, name: usersTable.name })
    .from(usersTable)
    .orderBy(asc(usersTable.username));
}

export async function roleKey(roleId: string): Promise<string | null | undefined> {
  const [row] = await getDb()
    .select({ key: rolesTable.key })
    .from(rolesTable)
    .where(eq(rolesTable.id, roleId));
  return row ? row.key : undefined;
}
