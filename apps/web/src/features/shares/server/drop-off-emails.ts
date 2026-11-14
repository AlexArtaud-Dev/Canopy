import 'server-only';

import { and, eq, gt, isNotNull, lte, sql } from 'drizzle-orm';

import { parseServerEnv } from '@/shared/config/env';
import { getDb } from '@/shared/db/client';
import { logger } from '@/shared/lib/logger';
import { usersTable } from '@/features/auth/server/auth.schema';
import { isMailConfigured } from '@/features/mail/mail.utils';
import { getMailSettings, sendMail } from '@/features/mail/server/mailer';
import { dropOffReceivedEmail } from '@/features/mail/templates/templates';

import { dropOffEmailDue, dropOffEmailFileLimit, dropOffQuietMs } from '../shares.utils';
import { shareDropOffFilesTable, shareDropOffsTable, sharesTable } from './shares.schema';

const log = logger.child({ module: 'shares' });

/** Drop-offs handled per sweep; the next sweep takes the rest. */
const sweepBatch = 50;

/** Takes the e-mail for a drop-off, once: another instance sweeping at the same time gets none. */
async function claim(id: string, fileCount: number): Promise<boolean> {
  const rows = await getDb()
    .update(shareDropOffsTable)
    .set({ emailedFileCount: fileCount })
    .where(
      and(
        eq(shareDropOffsTable.id, id),
        sql`${shareDropOffsTable.emailedFileCount} < ${fileCount}`,
      ),
    )
    .returning({ id: shareDropOffsTable.id });
  return rows.length > 0;
}

/**
 * E-mails link owners who asked for it about drop-offs that are over (nothing new for a while):
 * one e-mail per drop-off, sent again only if more files arrive later. Runs every minute.
 */
export async function sendDueDropOffEmails(): Promise<void> {
  if (!isMailConfigured(await getMailSettings())) return;
  const now = new Date();
  const due = await getDb()
    .select({
      id: shareDropOffsTable.id,
      name: shareDropOffsTable.name,
      email: shareDropOffsTable.email,
      verifiedAt: shareDropOffsTable.verifiedAt,
      fileCount: shareDropOffsTable.fileCount,
      byteCount: shareDropOffsTable.byteCount,
      emailedFileCount: shareDropOffsTable.emailedFileCount,
      lastUploadAt: shareDropOffsTable.lastUploadAt,
      shareId: sharesTable.id,
      link: sharesTable.name,
      ownerEmail: usersTable.contactEmail,
      ownerLocale: usersTable.locale,
    })
    .from(shareDropOffsTable)
    .innerJoin(sharesTable, eq(sharesTable.id, shareDropOffsTable.shareId))
    .innerJoin(usersTable, eq(usersTable.id, sharesTable.ownerId))
    .where(
      and(
        eq(sharesTable.notifyByEmail, true),
        isNotNull(usersTable.contactEmail),
        gt(shareDropOffsTable.fileCount, shareDropOffsTable.emailedFileCount),
        lte(shareDropOffsTable.lastUploadAt, new Date(now.getTime() - dropOffQuietMs)),
      ),
    )
    .limit(sweepBatch);
  const origin = parseServerEnv(process.env).CANOPY_PUBLIC_URL.replace(/\/+$/, '');
  for (const dropOff of due) {
    if (!dropOff.ownerEmail || !dropOffEmailDue(dropOff, now)) continue;
    if (!(await claim(dropOff.id, dropOff.fileCount))) continue;
    const files = await getDb()
      .select({ name: shareDropOffFilesTable.name })
      .from(shareDropOffFilesTable)
      .where(eq(shareDropOffFilesTable.dropOffId, dropOff.id))
      .orderBy(shareDropOffFilesTable.createdAt)
      .limit(dropOffEmailFileLimit);
    const mail = await dropOffReceivedEmail(dropOff.ownerLocale, {
      name: dropOff.name,
      email: dropOff.email,
      verified: dropOff.verifiedAt !== null,
      link: dropOff.link,
      count: dropOff.fileCount,
      files: files.map((file) => file.name),
      url: `${origin}/shares?dropOffs=${dropOff.shareId}`,
    });
    const outcome = await sendMail({ kind: 'shares.drop_off', to: dropOff.ownerEmail, ...mail });
    // Kept in the outbox for retries; the upload itself never waits on this.
    if (!outcome.ok) log.warn('drop-off e-mail not delivered yet', { dropOff: dropOff.id });
  }
}
