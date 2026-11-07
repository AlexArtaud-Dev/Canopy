import 'server-only';

import { desc } from 'drizzle-orm';

import { getDb } from '@/shared/db/client';
import { getSettings } from '@/features/settings/server/settings-store';

import { mailSettings } from '../mail.settings';
import { isMailConfigured } from '../mail.utils';
import { mailOutboxTable } from './mail.schema';

export interface OutboxItem {
  id: string;
  recipient: string;
  subject: string;
  status: 'queued' | 'sent' | 'failed';
  attempts: number;
  lastError: string | null;
  createdAt: string;
}

export async function listRecentMail(): Promise<OutboxItem[]> {
  const rows = await getDb()
    .select({
      id: mailOutboxTable.id,
      recipient: mailOutboxTable.recipient,
      subject: mailOutboxTable.subject,
      status: mailOutboxTable.status,
      attempts: mailOutboxTable.attempts,
      lastError: mailOutboxTable.lastError,
      createdAt: mailOutboxTable.createdAt,
    })
    .from(mailOutboxTable)
    .orderBy(desc(mailOutboxTable.createdAt))
    .limit(50);
  return rows.map((row) => ({ ...row, createdAt: new Date(row.createdAt).toISOString() }));
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
