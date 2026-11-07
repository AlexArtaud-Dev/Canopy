import 'server-only';

import { asc, count, eq, ilike, inArray, isNotNull, max, or, sql } from 'drizzle-orm';

import { getDb } from '@/shared/db/client';
import {
  groupMembersTable,
  groupRolesTable,
  rolesTable,
  userRolesTable,
} from '@/features/access/server/access.schema';
import { sessionsTable, totpFactorsTable, usersTable } from '@/features/auth/server/auth.schema';

import { likePattern, usersPageSize, type UsersQuery } from '../users.utils';

export interface RoleOption {
  id: string;
  key: string | null;
  name: string;
}

export interface UserRow {
  id: string;
  username: string;
  name: string;
  contactEmail: string | null;
  disabled: boolean;
  twoFactor: boolean;
  createdAt: string;
  lastActiveAt: string | null;
  roles: RoleOption[];
}

function groupBy<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const bucket = map.get(key(row));
    if (bucket) bucket.push(row);
    else map.set(key(row), [row]);
  }
  return map;
}

/** One page of users matching the search, with their roles, 2FA state and last activity. */
export async function listUsers(query: UsersQuery): Promise<{ items: UserRow[]; total: number }> {
  const db = getDb();
  const filter = query.q
    ? or(
        ilike(usersTable.username, likePattern(query.q)),
        ilike(usersTable.name, likePattern(query.q)),
        ilike(usersTable.contactEmail, likePattern(query.q)),
      )
    : undefined;

  const [users, [totalRow]] = await Promise.all([
    db
      .select({
        id: usersTable.id,
        username: usersTable.username,
        name: usersTable.name,
        contactEmail: usersTable.contactEmail,
        disabled: usersTable.disabled,
        createdAt: usersTable.createdAt,
      })
      .from(usersTable)
      .where(filter)
      .orderBy(asc(usersTable.username))
      .limit(usersPageSize)
      .offset((query.page - 1) * usersPageSize),
    db.select({ total: count() }).from(usersTable).where(filter),
  ]);
  const ids = users.map((user) => user.id);
  if (ids.length === 0) return { items: [], total: totalRow?.total ?? 0 };

  const [roles, factors, activity] = await Promise.all([
    db
      .select({
        userId: userRolesTable.userId,
        id: rolesTable.id,
        key: rolesTable.key,
        name: rolesTable.name,
      })
      .from(userRolesTable)
      .innerJoin(rolesTable, eq(rolesTable.id, userRolesTable.roleId))
      .where(inArray(userRolesTable.userId, ids)),
    db
      .select({ userId: totpFactorsTable.userId })
      .from(totpFactorsTable)
      .where(
        sql`${inArray(totpFactorsTable.userId, ids)} AND ${isNotNull(totpFactorsTable.enabledAt)}`,
      ),
    db
      .select({ userId: sessionsTable.userId, last: max(sessionsTable.updatedAt) })
      .from(sessionsTable)
      .where(inArray(sessionsTable.userId, ids))
      .groupBy(sessionsTable.userId),
  ]);
  const rolesByUser = groupBy(roles, (role) => role.userId);
  const withTotp = new Set(factors.map((factor) => factor.userId));
  const lastActive = new Map(activity.map((row) => [row.userId, row.last]));

  return {
    total: totalRow?.total ?? 0,
    items: users.map((user) => {
      const last = lastActive.get(user.id);
      return {
        ...user,
        createdAt: new Date(user.createdAt).toISOString(),
        lastActiveAt: last ? new Date(last).toISOString() : null,
        twoFactor: withTotp.has(user.id),
        roles: (rolesByUser.get(user.id) ?? []).map(({ id, key, name }) => ({ id, key, name })),
      };
    }),
  };
}

export function listRoleOptions(): Promise<RoleOption[]> {
  return getDb()
    .select({ id: rolesTable.id, key: rolesTable.key, name: rolesTable.name })
    .from(rolesTable)
    .orderBy(asc(rolesTable.name));
}

/** Enabled users holding `system:admin` (or `*`) directly or through a group. */
export async function activeAdminIds(): Promise<string[]> {
  const rows = await getDb().execute<{ id: string }>(sql`
    SELECT DISTINCT u.id FROM ${usersTable} u
    LEFT JOIN ${userRolesTable} ur ON ur.user_id = u.id
    LEFT JOIN ${groupMembersTable} gm ON gm.user_id = u.id
    LEFT JOIN ${groupRolesTable} gr ON gr.group_id = gm.group_id
    JOIN ${rolesTable} r ON r.id = ur.role_id OR r.id = gr.role_id
    WHERE NOT u.disabled AND r.permissions && ARRAY['*', 'system:admin']::text[]`);
  return rows.map((row) => row.id);
}

/** Replaces the user's direct roles; unknown role ids are ignored by the foreign key filter. */
export async function setUserRoles(userId: string, roleIds: readonly string[]): Promise<void> {
  await getDb().transaction(async (tx) => {
    await tx.delete(userRolesTable).where(eq(userRolesTable.userId, userId));
    if (roleIds.length === 0) return;
    const existing = await tx
      .select({ id: rolesTable.id })
      .from(rolesTable)
      .where(inArray(rolesTable.id, [...roleIds]));
    if (existing.length === 0) return;
    await tx.insert(userRolesTable).values(existing.map((role) => ({ userId, roleId: role.id })));
  });
}

/** Would these direct roles still make the user an administrator? */
export async function rolesGrantAdmin(roleIds: readonly string[]): Promise<boolean> {
  if (roleIds.length === 0) return false;
  const rows = await getDb()
    .select({ id: rolesTable.id })
    .from(rolesTable)
    .where(
      sql`${inArray(rolesTable.id, [...roleIds])} AND ${rolesTable.permissions} && ARRAY['*', 'system:admin']::text[]`,
    );
  return rows.length > 0;
}
