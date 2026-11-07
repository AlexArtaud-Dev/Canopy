import { sql } from 'drizzle-orm';
import { index, inet, jsonb, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { auditSchema } from '@/shared/db/schemas.schema';

/**
 * Append-only: a trigger (migration 0002) rejects UPDATE, and DELETE unless the retention purge
 * sets `canopy.audit_purge`. The engine role may only INSERT (default privileges).
 */
export const auditEventsTable = auditSchema.table(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    actorId: text('actor_id'),
    actorIp: inet('actor_ip'),
    action: text('action').notNull(),
    target: text('target'),
    result: text('result', { enum: ['success', 'denied', 'error'] }).notNull(),
    requestId: text('request_id').notNull(),
    meta: jsonb('meta')
      .notNull()
      .default(sql`'{}'::jsonb`),
  },
  (table) => [
    index('events_occurred_at_idx').on(table.occurredAt.desc()),
    index('events_actor_id_idx').on(table.actorId),
    index('events_action_idx').on(table.action),
    index('events_result_idx').on(table.result),
  ],
);
