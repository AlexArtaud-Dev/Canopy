import 'server-only';

import { and, count, desc, eq, gt, gte, isNull, lt, sql } from 'drizzle-orm';

import { getDb } from '@/shared/db/client';
import { auditEventsTable } from '@/features/audit/server/audit.schema';
import { sessionsTable, usersTable } from '@/features/auth/server/auth.schema';
import { shareDropOffsTable, sharesTable } from '@/features/shares/server/shares.schema';

import type { LogLine, VariableData, VariablePoint } from '../variables.utils';

/** Log lines a panel lists: the latest ones. */
const logLines = 50;

interface Window {
  from: Date;
  to: Date;
  bucketSeconds: number;
}

function countSeries(points: VariablePoint[], bucket: number): VariableData {
  return { kind: 'series', unit: 'count', bucketSeconds: bucket, series: [{ name: '', points }] };
}

/** A count right now, as a one-point series: the web app keeps no history of these. */
function nowValue(value: number, window: Window): VariableData {
  return countSeries(
    [{ at: window.to.toISOString(), avg: value, min: value, max: value }],
    window.bucketSeconds,
  );
}

/** Events per bucket over the window, from a timestamp column of a table. */
async function bucketCounts(
  column: typeof auditEventsTable.occurredAt | typeof shareDropOffsTable.createdAt,
  where: ReturnType<typeof and>,
  window: Window,
): Promise<VariableData> {
  const bucket = sql<Date>`date_bin(${`${String(window.bucketSeconds)} seconds`}::interval, ${column}, ${window.from})`;
  const rows = await getDb()
    .select({ at: bucket, total: count() })
    .from(column.table)
    .where(and(gte(column, window.from), lt(column, window.to), where))
    .groupBy(bucket)
    .orderBy(bucket);
  return countSeries(
    rows.map((row) => {
      const at = new Date(row.at).toISOString();
      return { at, avg: row.total, min: row.total, max: row.total };
    }),
    window.bucketSeconds,
  );
}

/** Reads one web-computed variable; the caller checked the permission. */
export async function readWebVariable(id: string, window: Window): Promise<VariableData | null> {
  const db = getDb();
  switch (id) {
    case 'shares.active': {
      const [row] = await db
        .select({ total: count() })
        .from(sharesTable)
        .where(and(isNull(sharesTable.revokedAt), gt(sharesTable.expiresAt, window.to)));
      return nowValue(row?.total ?? 0, window);
    }
    case 'shares.dropOffs':
      return bucketCounts(
        shareDropOffsTable.createdAt,
        gt(shareDropOffsTable.fileCount, 0),
        window,
      );
    case 'users.accounts': {
      const [row] = await db
        .select({ total: count() })
        .from(usersTable)
        .where(eq(usersTable.disabled, false));
      return nowValue(row?.total ?? 0, window);
    }
    case 'users.sessions': {
      const [row] = await db
        .select({ total: count() })
        .from(sessionsTable)
        .where(gt(sessionsTable.expiresAt, window.to));
      return nowValue(row?.total ?? 0, window);
    }
    case 'logs.denied':
      return bucketCounts(
        auditEventsTable.occurredAt,
        eq(auditEventsTable.result, 'denied'),
        window,
      );
    case 'logs.audit': {
      const rows = await db
        .select({
          at: auditEventsTable.occurredAt,
          action: auditEventsTable.action,
          result: auditEventsTable.result,
          actor: usersTable.username,
          target: auditEventsTable.target,
        })
        .from(auditEventsTable)
        .leftJoin(usersTable, eq(usersTable.id, auditEventsTable.actorId))
        .where(
          and(
            gte(auditEventsTable.occurredAt, window.from),
            lt(auditEventsTable.occurredAt, window.to),
          ),
        )
        .orderBy(desc(auditEventsTable.occurredAt))
        .limit(logLines);
      const lines: LogLine[] = rows.map((row) => ({
        at: row.at.toISOString(),
        action: row.action,
        result: row.result,
        actor: row.actor,
        target: row.target,
      }));
      return { kind: 'log', lines };
    }
    default:
      return null;
  }
}
