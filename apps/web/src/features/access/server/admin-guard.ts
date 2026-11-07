import 'server-only';

import { sql } from 'drizzle-orm';

import { getDb } from '@/shared/db/client';
import { AppBaseError } from '@/shared/lib/errors';
import { usersTable } from '@/features/auth/server/auth.schema';

import { groupMembersTable, groupRolesTable, rolesTable, userRolesTable } from './access.schema';

type Executor = Pick<ReturnType<typeof getDb>, 'execute'>;

/** Enabled users holding `system:admin` (or `*`) directly or through a group. */
export async function activeAdminIds(executor: Executor = getDb()): Promise<string[]> {
  const rows = await executor.execute<{ id: string }>(sql`
    SELECT DISTINCT u.id FROM ${usersTable} u
    LEFT JOIN ${userRolesTable} ur ON ur.user_id = u.id
    LEFT JOIN ${groupMembersTable} gm ON gm.user_id = u.id
    LEFT JOIN ${groupRolesTable} gr ON gr.group_id = gm.group_id
    JOIN ${rolesTable} r ON r.id = ur.role_id OR r.id = gr.role_id
    WHERE NOT u.disabled AND r.permissions && ARRAY['*', 'system:admin']::text[]`);
  return rows.map((row) => row.id);
}

/**
 * Runs a change in a transaction and rolls it back if Canopy would be left without an active
 * administrator — whatever the path (role edit, group change, membership, deletion).
 */
export async function withAdminGuard<T>(
  change: (tx: Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0]) => Promise<T>,
): Promise<T> {
  return getDb().transaction(async (tx) => {
    const result = await change(tx);
    if ((await activeAdminIds(tx)).length === 0) {
      throw new AppBaseError('users.last_admin', 'change would remove the last administrator');
    }
    return result;
  });
}
