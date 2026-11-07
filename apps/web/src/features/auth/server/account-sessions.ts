import 'server-only';

import { and, desc, eq, ne } from 'drizzle-orm';

import { getDb } from '@/shared/db/client';

import { describeUserAgent, type DeviceSummary } from '../account.utils';
import { sessionsTable } from './auth.schema';

export interface SessionSummary extends DeviceSummary {
  id: string;
  ipAddress: string | null;
  createdAt: string;
  lastActiveAt: string;
  current: boolean;
}

/** The user's signed-in sessions, most recently active first (pending 2FA ones excluded). */
export async function listSessions(
  userId: string,
  currentSessionId: string,
): Promise<SessionSummary[]> {
  const rows = await getDb()
    .select({
      id: sessionsTable.id,
      ipAddress: sessionsTable.ipAddress,
      userAgent: sessionsTable.userAgent,
      createdAt: sessionsTable.createdAt,
      updatedAt: sessionsTable.updatedAt,
    })
    .from(sessionsTable)
    .where(and(eq(sessionsTable.userId, userId), eq(sessionsTable.twoFactorPending, false)))
    .orderBy(desc(sessionsTable.updatedAt));
  return rows.map((row) => ({
    id: row.id,
    ipAddress: row.ipAddress,
    ...describeUserAgent(row.userAgent),
    createdAt: new Date(row.createdAt).toISOString(),
    lastActiveAt: new Date(row.updatedAt).toISOString(),
    current: row.id === currentSessionId,
  }));
}

/** Deletes one of the user's sessions; returns false when it is not theirs (or is gone). */
export async function deleteSession(userId: string, sessionId: string): Promise<boolean> {
  const deleted = await getDb()
    .delete(sessionsTable)
    .where(and(eq(sessionsTable.userId, userId), eq(sessionsTable.id, sessionId)))
    .returning({ id: sessionsTable.id });
  return deleted.length > 0;
}

/** Signs out every other device; returns how many sessions ended. */
export async function deleteOtherSessions(userId: string, keepSessionId: string): Promise<number> {
  const deleted = await getDb()
    .delete(sessionsTable)
    .where(and(eq(sessionsTable.userId, userId), ne(sessionsTable.id, keepSessionId)))
    .returning({ id: sessionsTable.id });
  return deleted.length;
}
