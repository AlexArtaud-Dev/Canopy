import 'server-only';

import { getConnection } from '@/shared/db/client';
import { getSettings } from '@/features/settings/server/settings-store';

import { auditSettings } from '../audit.settings';
import { purgeAuditEvents } from './audit-store';

// Arbitrary constant: one purge at a time across instances.
const purgeLockId = 7_201_303;

/** Daily retention purge; the purge is recorded as an audit event of its own. */
export async function purgeExpiredAuditEvents(): Promise<void> {
  const lock = await getConnection().sql.reserve();
  try {
    const [{ locked } = { locked: false }] = await lock<{ locked: boolean }[]>`
      SELECT pg_try_advisory_lock(${purgeLockId}) AS locked`;
    if (!locked) return;
    try {
      const { values } = await getSettings('audit', auditSettings);
      const deleted = await purgeAuditEvents(values.retentionDays);
      if (deleted > 0) {
        // Written directly: no request context exists in a background job.
        await getConnection().sql`
          INSERT INTO audit.events (action, result, request_id, meta)
          VALUES ('audit.purge', 'success', 'system', ${JSON.stringify({ deleted, retentionDays: values.retentionDays })}::jsonb)`;
      }
    } finally {
      await lock`SELECT pg_advisory_unlock(${purgeLockId})`;
    }
  } finally {
    lock.release();
  }
}
