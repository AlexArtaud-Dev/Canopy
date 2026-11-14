import { deliverDueMail, purgeOldMail } from '@/features/mail/server/mailer';
import { getSettings } from '@/features/settings/server/settings-store';
import { systemSettings } from '@/features/system/system.settings';
import { purgeExpiredAuditEvents } from '@/features/audit/server/audit-retention';
import { sendDueDropOffEmails } from '@/features/shares/server/drop-off-emails';
import { runMigrations } from '@/shared/db/migrate';
import { logger } from '@/shared/lib/logger';

const mailSweepIntervalMs = 60_000;
const auditPurgeIntervalMs = 24 * 60 * 60 * 1000;

/** Repeats a background job; timers never keep the process alive and failures are logged. */
function every(intervalMs: number, job: () => Promise<void>, name: string, runNow = false): void {
  const run = () => {
    job().catch((error: unknown) => {
      logger.error(`${name} failed`, { module: 'jobs', error });
    });
  };
  if (runNow) run();
  setInterval(run, intervalMs).unref();
}

/** Node-only startup: migrations, then the in-process background jobs. */
export async function startNodeServer(): Promise<void> {
  if (!process.env.CANOPY_DATABASE_URL) return;
  await runMigrations();
  // Instances coordinate through advisory locks, so every instance may run these.
  every(mailSweepIntervalMs, deliverDueMail, 'mail sweep');
  every(mailSweepIntervalMs, sendDueDropOffEmails, 'drop-off e-mails');
  every(auditPurgeIntervalMs, purgeExpiredAuditEvents, 'audit purge', true);
  every(
    auditPurgeIntervalMs,
    async () => {
      const { values } = await getSettings('system', systemSettings);
      await purgeOldMail(values.mailRetentionDays);
    },
    'mail purge',
    true,
  );
}
