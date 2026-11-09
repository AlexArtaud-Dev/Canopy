import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { appSchema } from '@/shared/db/schemas.schema';
import { usersTable } from '@/features/auth/server/auth.schema';

/**
 * Share links. The token itself is never stored in clear: `token_hash` finds a link from its
 * URL, `token_sealed` (encrypted) lets the owner copy the link again.
 */
export const sharesTable = appSchema.table(
  'shares',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: text('token_hash').notNull().unique(),
    tokenSealed: text('token_sealed').notNull(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    /** Clean virtual path of the shared file or folder. */
    path: text('path').notNull(),
    name: text('name').notNull(),
    isDirectory: boolean('is_directory').notNull(),
    passwordHash: text('password_hash'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    maxDownloads: integer('max_downloads'),
    downloadCount: integer('download_count').notNull().default(0),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    lastAccessAt: timestamp('last_access_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('shares_owner_id_idx').on(table.ownerId),
    index('shares_expires_at_idx').on(table.expiresAt),
    check('shares_path_check', sql`${table.path} LIKE '/%'`),
    check(
      'shares_max_downloads_check',
      sql`${table.maxDownloads} IS NULL OR ${table.maxDownloads} > 0`,
    ),
  ],
);
