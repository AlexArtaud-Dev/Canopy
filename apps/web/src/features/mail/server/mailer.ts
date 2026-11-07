import 'server-only';

import { createHash } from 'node:crypto';

import { and, eq, lte, sql } from 'drizzle-orm';
import nodemailer, { type Transporter } from 'nodemailer';

import { getConnection, getDb } from '@/shared/db/client';
import { logger } from '@/shared/lib/logger';
import { getSettings } from '@/features/settings/server/settings-store';

import { mailSettings, type MailSettings } from '../mail.settings';
import {
  failureCode,
  fromHeader,
  isMailConfigured,
  nextAttemptDelayMs,
  transportOptions,
} from '../mail.utils';
import { mailOutboxTable } from './mail.schema';

const log = logger.child({ module: 'mail' });
// Arbitrary constant: one sweep at a time across instances.
const sweepLockId = 7_201_302;
const sweepBatch = 20;

export interface OutgoingMail {
  kind: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

let transport: { key: string; transporter: Transporter } | undefined;

function transporterFor(settings: MailSettings): Transporter {
  // Rebuilt when any SMTP setting changes (the hash covers the password without keeping it).
  const key = createHash('sha256')
    .update(JSON.stringify(transportOptions(settings)))
    .digest('hex');
  if (transport?.key !== key) {
    transport = { key, transporter: nodemailer.createTransport(transportOptions(settings)) };
  }
  return transport.transporter;
}

export async function getMailSettings(): Promise<MailSettings> {
  return (await getSettings('mail', mailSettings)).values;
}

type OutboxRow = typeof mailOutboxTable.$inferSelect;

/** `ok`, or the translatable code of why the message is not delivered (yet). */
export type DeliveryOutcome = { ok: true } | { ok: false; code: string };

/** One delivery attempt; records the outcome and schedules a retry on failure. */
async function attempt(row: OutboxRow, settings: MailSettings): Promise<DeliveryOutcome> {
  const attempts = row.attempts + 1;
  try {
    await transporterFor(settings).sendMail({
      from: fromHeader(settings),
      to: row.recipient,
      subject: row.subject,
      html: row.html,
      text: row.text,
    });
    await getDb()
      .update(mailOutboxTable)
      .set({ status: 'sent', attempts, sentAt: new Date(), lastError: null })
      .where(eq(mailOutboxTable.id, row.id));
    return { ok: true };
  } catch (error) {
    const code = failureCode(error);
    const delay = nextAttemptDelayMs(attempts);
    // The recipient is personal data: logs keep the outbox id only.
    log.warn('mail delivery failed', { outboxId: row.id, code, attempts });
    await getDb()
      .update(mailOutboxTable)
      .set({
        attempts,
        lastError: code,
        status: delay === null ? 'failed' : 'queued',
        nextAttemptAt: new Date(Date.now() + (delay ?? 0)),
      })
      .where(eq(mailOutboxTable.id, row.id));
    return { ok: false, code };
  }
}

/**
 * Queues an email and tries to deliver it right away. A failed attempt stays queued for retries;
 * `mail.not_configured` when SMTP is off.
 */
export async function sendMail(mail: OutgoingMail): Promise<DeliveryOutcome> {
  const settings = await getMailSettings();
  const [row] = await getDb()
    .insert(mailOutboxTable)
    .values({
      kind: mail.kind,
      recipient: mail.to,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    })
    .returning();
  if (!row) throw new Error('outbox insert returned no row');
  if (!isMailConfigured(settings)) return { ok: false, code: 'mail.not_configured' };
  return attempt(row, settings);
}

/** Retries due messages; safe to call from several instances (advisory lock). */
export async function deliverDueMail(): Promise<void> {
  const settings = await getMailSettings();
  if (!isMailConfigured(settings)) return;
  const lock = await getConnection().sql.reserve();
  try {
    const [{ locked } = { locked: false }] = await lock<{ locked: boolean }[]>`
      SELECT pg_try_advisory_lock(${sweepLockId}) AS locked`;
    if (!locked) return;
    try {
      const due = await getDb()
        .select()
        .from(mailOutboxTable)
        .where(
          and(eq(mailOutboxTable.status, 'queued'), lte(mailOutboxTable.nextAttemptAt, sql`now()`)),
        )
        .orderBy(mailOutboxTable.nextAttemptAt)
        .limit(sweepBatch);
      for (const row of due) await attempt(row, settings);
    } finally {
      await lock`SELECT pg_advisory_unlock(${sweepLockId})`;
    }
  } finally {
    lock.release();
  }
}

/** Deletes delivered or abandoned emails older than the retention (they hold personal data). */
export async function purgeOldMail(retentionDays: number): Promise<number> {
  const deleted = await getDb()
    .delete(mailOutboxTable)
    .where(
      and(
        sql`${mailOutboxTable.status} <> 'queued'`,
        lte(mailOutboxTable.createdAt, sql`now() - make_interval(days => ${retentionDays})`),
      ),
    )
    .returning({ id: mailOutboxTable.id });
  return deleted.length;
}
