import { boolean, index, integer, jsonb, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { appSchema } from '@/shared/db/schemas.schema';
import { usersTable } from '@/features/auth/server/auth.schema';

import type { Panel } from '../dashboards.utils';

/** A person's dashboards: what they arranged, never seen by anyone else. */
export const dashboardsTable = appSchema.table(
  'dashboards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** The one `/dashboards` opens. */
    isHome: boolean('is_home').notNull().default(false),
    range: text('range').notNull().default('24h'),
    refreshSeconds: integer('refresh_seconds').notNull().default(60),
    /** Validated with `panelSchema` on every save and read. */
    panels: jsonb('panels').$type<Panel[]>().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('dashboards_user_idx').on(table.userId, table.name)],
);
