import { sql } from 'drizzle-orm';
import { boolean, index, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { authSchema } from '@/shared/db/schemas.schema';
import { usersTable } from '@/features/auth/server/auth.schema';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

/** Named bundle of global permissions. Built-in roles carry a stable `key`; all are editable. */
export const rolesTable = authSchema.table('roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** `admin`, `editor`, `viewer` for built-ins (labels translated); null for custom roles. */
  key: text('key').unique(),
  name: text('name').notNull().unique(),
  description: text('description').notNull().default(''),
  /** `<module>:<action>` keys, or `*` for every permission (Admin). */
  permissions: text('permissions')
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  ...timestamps,
});

export const groupsTable = authSchema.table('groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  description: text('description').notNull().default(''),
  /** Members must use two-factor authentication. */
  requireTwoFactor: boolean('require_two_factor').notNull().default(false),
  ...timestamps,
});

export const groupMembersTable = authSchema.table(
  'group_members',
  {
    groupId: uuid('group_id')
      .notNull()
      .references(() => groupsTable.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.groupId, table.userId] }),
    index('group_members_user_id_idx').on(table.userId),
  ],
);

export const userRolesTable = authSchema.table(
  'user_roles',
  {
    userId: text('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => rolesTable.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.roleId] }),
    index('user_roles_role_id_idx').on(table.roleId),
  ],
);

export const groupRolesTable = authSchema.table(
  'group_roles',
  {
    groupId: uuid('group_id')
      .notNull()
      .references(() => groupsTable.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => rolesTable.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.groupId, table.roleId] }),
    index('group_roles_role_id_idx').on(table.roleId),
  ],
);
