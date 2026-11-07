import 'server-only';

import { and, count, desc, eq, gte, ilike, lte, or, sql, type SQL } from 'drizzle-orm';

import { getConnection, getDb } from '@/shared/db/client';
import { usersTable } from '@/features/auth/server/auth.schema';
import { likePattern } from '@/features/users/users.utils';

import { auditPageSize, dateRange, type AuditFilters } from '../audit-view.utils';
import { auditEventsTable } from './audit.schema';

export interface AuditRow {
  id: string;
  occurredAt: string;
  actorId: string | null;
  actorName: string | null;
  actorIp: string | null;
  action: string;
  target: string | null;
  result: 'success' | 'denied' | 'error';
  requestId: string;
  meta: unknown;
}

function whereOf(filters: AuditFilters): SQL | undefined {
  const { start, end } = dateRange(filters);
  const conditions = [
    filters.action ? eq(auditEventsTable.action, filters.action) : undefined,
    filters.result ? eq(auditEventsTable.result, filters.result) : undefined,
    filters.target ? ilike(auditEventsTable.target, likePattern(filters.target)) : undefined,
    filters.actor
      ? or(
          ilike(usersTable.username, likePattern(filters.actor)),
          eq(auditEventsTable.actorId, filters.actor),
        )
      : undefined,
    start ? gte(auditEventsTable.occurredAt, start) : undefined,
    end ? lte(auditEventsTable.occurredAt, end) : undefined,
  ].filter((condition) => condition !== undefined);
  return conditions.length > 0 ? and(...conditions) : undefined;
}

function baseQuery() {
  return getDb()
    .select({
      id: auditEventsTable.id,
      occurredAt: auditEventsTable.occurredAt,
      actorId: auditEventsTable.actorId,
      actorName: usersTable.username,
      actorIp: sql<string | null>`host(${auditEventsTable.actorIp})`,
      action: auditEventsTable.action,
      target: auditEventsTable.target,
      result: auditEventsTable.result,
      requestId: auditEventsTable.requestId,
      meta: auditEventsTable.meta,
    })
    .from(auditEventsTable)
    .leftJoin(usersTable, eq(usersTable.id, auditEventsTable.actorId));
}

function toRow(
  row: Awaited<ReturnType<ReturnType<typeof baseQuery>['execute']>>[number],
): AuditRow {
  return { ...row, occurredAt: new Date(row.occurredAt).toISOString() };
}

/** One page of events, newest first, with the total for pagination. */
export async function listAuditEvents(
  filters: AuditFilters,
): Promise<{ rows: AuditRow[]; total: number }> {
  const where = whereOf(filters);
  const [rows, [totalRow]] = await Promise.all([
    baseQuery()
      .where(where)
      .orderBy(desc(auditEventsTable.occurredAt))
      .limit(auditPageSize)
      .offset((filters.page - 1) * auditPageSize),
    getDb()
      .select({ total: count() })
      .from(auditEventsTable)
      .leftJoin(usersTable, eq(usersTable.id, auditEventsTable.actorId))
      .where(where),
  ]);
  return { rows: rows.map(toRow), total: totalRow?.total ?? 0 };
}

/** Matching events for a CSV export, capped. */
export async function exportAuditEvents(filters: AuditFilters, limit: number): Promise<AuditRow[]> {
  const rows = await baseQuery()
    .where(whereOf(filters))
    .orderBy(desc(auditEventsTable.occurredAt))
    .limit(limit);
  return rows.map(toRow);
}

/**
 * Deletes events older than the retention. The append-only trigger only allows DELETE inside a
 * transaction that sets `canopy.audit_purge`; returns how many rows went.
 */
export async function purgeAuditEvents(retentionDays: number): Promise<number> {
  return getConnection().sql.begin(async (tx) => {
    await tx`SET LOCAL canopy.audit_purge = 'on'`;
    const deleted = await tx`
      DELETE FROM audit.events
      WHERE occurred_at < now() - make_interval(days => ${retentionDays})`;
    return deleted.count;
  });
}
