import { sql } from 'drizzle-orm';
import { check, index, integer, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { appSchema } from '@/shared/db/schemas.schema';

/**
 * Every email goes through this outbox: it is written first, then delivered (immediately when
 * possible, else by the retry sweep), so nothing is lost when SMTP is down and admins can see
 * what was sent.
 */
export const mailOutboxTable = appSchema.table(
  'mail_outbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** `invitation`, `password_reset`, `security_notice`, `test`… */
    kind: text('kind').notNull(),
    recipient: text('recipient').notNull(),
    subject: text('subject').notNull(),
    html: text('html').notNull(),
    text: text('text').notNull(),
    status: text('status', { enum: ['queued', 'sent', 'failed'] })
      .notNull()
      .default('queued'),
    attempts: integer('attempts').notNull().default(0),
    /** Translatable code of the last failure (`mail.auth_failed`…), never the raw server text. */
    lastError: text('last_error'),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (table) => [
    index('mail_outbox_due_idx').on(table.status, table.nextAttemptAt),
    index('mail_outbox_created_idx').on(table.createdAt.desc()),
    check('mail_outbox_status_check', sql`${table.status} IN ('queued', 'sent', 'failed')`),
  ],
);
