import 'server-only';

import { and, count, desc, eq, ilike, or } from 'drizzle-orm';

import { getDb } from '@/shared/db/client';
import { getSettings } from '@/features/settings/server/settings-store';
import { likePattern } from '@/features/users/users.utils';

import { mailSettings } from '../mail.settings';
import {
  isMailConfigured,
  outboxPageSize,
  type OutboxQuery,
  type OutboxStatus,
} from '../mail.utils';
import { mailOutboxTable } from './mail.schema';

export interface OutboxItem {
  id: string;
  kind: string;
  recipient: string;
  subject: string;
  status: OutboxStatus;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  sentAt: string | null;
}

/** A stored e-mail with its content, for administrators to read or send again. */
export interface OutboxMessage extends OutboxItem {
  html: string;
  text: string;
}

const listColumns = {
  id: mailOutboxTable.id,
  kind: mailOutboxTable.kind,
  recipient: mailOutboxTable.recipient,
  subject: mailOutboxTable.subject,
  status: mailOutboxTable.status,
  attempts: mailOutboxTable.attempts,
  lastError: mailOutboxTable.lastError,
  createdAt: mailOutboxTable.createdAt,
  sentAt: mailOutboxTable.sentAt,
};

function toItem<T extends { createdAt: Date; sentAt: Date | null }>(row: T) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    sentAt: row.sentAt ? row.sentAt.toISOString() : null,
  };
}

/** One page of the e-mails kept (newest first), filtered by status and by recipient or subject. */
export async function listOutbox(
  query: OutboxQuery,
): Promise<{ items: OutboxItem[]; total: number }> {
  const db = getDb();
  const filter = and(
    query.status ? eq(mailOutboxTable.status, query.status) : undefined,
    query.q
      ? or(
          ilike(mailOutboxTable.recipient, likePattern(query.q)),
          ilike(mailOutboxTable.subject, likePattern(query.q)),
        )
      : undefined,
  );
  const [rows, [totals]] = await Promise.all([
    db
      .select(listColumns)
      .from(mailOutboxTable)
      .where(filter)
      .orderBy(desc(mailOutboxTable.createdAt))
      .limit(outboxPageSize)
      .offset((query.page - 1) * outboxPageSize),
    db.select({ total: count() }).from(mailOutboxTable).where(filter),
  ]);
  return { items: rows.map(toItem), total: totals?.total ?? 0 };
}

export async function findOutboxMessage(id: string): Promise<OutboxMessage | null> {
  const [row] = await getDb()
    .select({ ...listColumns, html: mailOutboxTable.html, text: mailOutboxTable.text })
    .from(mailOutboxTable)
    .where(eq(mailOutboxTable.id, id));
  return row ? toItem(row) : null;
}

/** Settings for the admin form: the password itself never leaves the server. */
export async function getMailAdminView() {
  const { values, locked } = await getSettings('mail', mailSettings);
  const { password, ...rest } = values;
  return {
    values: rest,
    passwordSet: password !== '',
    locked: [...locked],
    configured: isMailConfigured(values),
  };
}
