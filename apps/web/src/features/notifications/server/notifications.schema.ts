import { index, jsonb, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { appSchema } from '@/shared/db/schemas.schema';
import { usersTable } from '@/features/auth/server/auth.schema';

/**
 * What the bell shows a person. One row per event source (`source_key`): an event that grows
 * (more files in the same drop-off) updates its row instead of adding one per file.
 */
export const notificationsTable = appSchema.table(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    /** A key of `notifications.kinds` in the messages: the text is translated when shown. */
    kind: text('kind').notNull(),
    sourceKey: text('source_key').notNull(),
    /** Values for the translated text (names, counts); never secrets. */
    params: jsonb('params').$type<Record<string, string | number>>().notNull().default({}),
    /** Where opening it leads, inside the app. */
    href: text('href'),
    readAt: timestamp('read_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('notifications_source_unique').on(table.userId, table.sourceKey),
    index('notifications_user_idx').on(table.userId, table.updatedAt),
  ],
);
