'use server';

import { runAction, type ActionResult } from '@/shared/lib/action';
import { audit } from './audit-writer';
import { authorize } from '@/features/auth';

import { auditExportLimit, auditFiltersSchema, csvRow } from '../audit-view.utils';
import { exportAuditEvents } from './audit-store';

const header = [
  'time',
  'actor',
  'actor_id',
  'ip',
  'action',
  'result',
  'target',
  'request_id',
  'meta',
];

/** CSV of the filtered events (newest first, capped); the export itself is audited. */
export async function exportAuditCsv(
  input: unknown,
): Promise<ActionResult<{ csv: string; rows: number }>> {
  return runAction(async () => {
    const { user } = await authorize('audit:export');
    const filters = auditFiltersSchema.parse(input);
    const rows = await exportAuditEvents(filters, auditExportLimit);
    const csv = [
      csvRow(header),
      ...rows.map((row) =>
        csvRow([
          row.occurredAt,
          row.actorName,
          row.actorId,
          row.actorIp,
          row.action,
          row.result,
          row.target,
          row.requestId,
          JSON.stringify(row.meta),
        ]),
      ),
    ].join('\r\n');
    await audit({
      action: 'audit.export',
      result: 'success',
      actorId: user.id,
      meta: { rows: rows.length, filters: { ...filters, page: undefined } },
    });
    return { csv, rows: rows.length };
  });
}
