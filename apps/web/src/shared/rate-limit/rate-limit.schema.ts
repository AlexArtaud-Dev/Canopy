import { integer, text, timestamp } from 'drizzle-orm/pg-core';

import { appSchema } from '@/shared/db/schemas.schema';

/** Fixed-window counters, shared by every web instance (no in-memory state to drift). */
export const rateLimitsTable = appSchema.table('rate_limits', {
  key: text('key').primaryKey(),
  windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
  hits: integer('hits').notNull(),
});
