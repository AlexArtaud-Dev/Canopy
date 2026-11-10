import { index, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { appSchema } from '@/shared/db/schemas.schema';
import { usersTable } from '@/features/auth/server/auth.schema';

/**
 * Folders a person pinned for quick access. Personal shortcuts only: opening one still goes
 * through the engine's path grants.
 */
export const favoriteFoldersTable = appSchema.table(
  'favorite_folders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    /** Clean virtual path (`/media/photos`). */
    path: text('path').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('favorite_folders_user_path_unique').on(table.userId, table.path),
    index('favorite_folders_user_idx').on(table.userId),
  ],
);
