import { sql } from 'drizzle-orm';
import { check, index, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { appSchema } from '@/shared/db/schemas.schema';

/**
 * Who may do what under a folder. Lives in `app` so the engine (read-only on this schema) resolves
 * grants itself; subjects are users or groups by id (no foreign key across schemas the engine
 * cannot read — deletions clean up through the web app).
 */
export const pathGrantsTable = appSchema.table(
  'path_grants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subjectType: text('subject_type', { enum: ['user', 'group'] }).notNull(),
    subjectId: text('subject_id').notNull(),
    /** Clean virtual path (`/media/photos`). */
    path: text('path').notNull(),
    actions: text('actions').array().notNull(),
    effect: text('effect', { enum: ['allow', 'deny'] }).notNull(),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('path_grants_subject_idx').on(table.subjectType, table.subjectId),
    index('path_grants_path_idx').on(table.path),
    check('path_grants_subject_type_check', sql`${table.subjectType} IN ('user', 'group')`),
    check('path_grants_effect_check', sql`${table.effect} IN ('allow', 'deny')`),
    check('path_grants_path_check', sql`${table.path} LIKE '/%'`),
  ],
);
