import { jsonb, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

import { appSchema } from '@/shared/db/schemas.schema';

/**
 * Only values that differ from their default are stored. Sensitive values hold an encrypted
 * envelope (`{ "sealed": "v1...." }`). The engine role reads this table (default privileges).
 */
export const settingsTable = appSchema.table(
  'settings',
  {
    module: text('module').notNull(),
    key: text('key').notNull(),
    value: jsonb('value').notNull(),
    updatedBy: text('updated_by'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.module, table.key] })],
);
