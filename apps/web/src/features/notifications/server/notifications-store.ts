import 'server-only';

import { and, desc, eq, inArray, isNull, lt } from 'drizzle-orm';

import { getDb } from '@/shared/db/client';
import { logger } from '@/shared/lib/logger';

import {
  isNotificationKind,
  notificationListLimit,
  notificationRetentionMs,
  safeHref,
  type NotificationKind,
  type NotificationView,
} from '../notifications.utils';
import { notificationsTable } from './notifications.schema';

const log = logger.child({ module: 'notifications' });

/** An event for one person, as a feature reports it. */
export interface NotificationInput {
  userId: string;
  kind: NotificationKind;
  /** Same key, same notification: it is updated (and unread again) instead of repeated. */
  sourceKey: string;
  params: Record<string, string | number>;
  href: string | null;
}

/**
 * Tells a person something happened. Features call this from the server after the change they
 * report; it never throws on their path (a missed notification must not fail an upload).
 */
export async function notify(input: NotificationInput): Promise<void> {
  const now = new Date();
  try {
    await getDb()
      .insert(notificationsTable)
      .values({ ...input, href: safeHref(input.href), updatedAt: now })
      .onConflictDoUpdate({
        target: [notificationsTable.userId, notificationsTable.sourceKey],
        set: { params: input.params, href: safeHref(input.href), updatedAt: now, readAt: null },
      });
  } catch (error) {
    log.error('notification not recorded', { kind: input.kind, userId: input.userId, error });
  }
}

/** The person's latest notifications; older than the retention are forgotten first. */
export async function listNotifications(userId: string): Promise<NotificationView[]> {
  const db = getDb();
  await db
    .delete(notificationsTable)
    .where(lt(notificationsTable.updatedAt, new Date(Date.now() - notificationRetentionMs)));
  const rows = await db
    .select({
      id: notificationsTable.id,
      kind: notificationsTable.kind,
      params: notificationsTable.params,
      href: notificationsTable.href,
      readAt: notificationsTable.readAt,
      updatedAt: notificationsTable.updatedAt,
    })
    .from(notificationsTable)
    .where(eq(notificationsTable.userId, userId))
    .orderBy(desc(notificationsTable.updatedAt))
    .limit(notificationListLimit);
  return rows.flatMap((row) => {
    // A kind this version no longer knows is left out rather than shown untranslated.
    if (!isNotificationKind(row.kind)) return [];
    return [
      {
        id: row.id,
        kind: row.kind,
        params: row.params,
        href: row.href,
        read: row.readAt !== null,
        updatedAt: row.updatedAt.toISOString(),
      },
    ];
  });
}

/** Marks the person's notifications read: the given ones, or all. */
export async function markRead(userId: string, ids?: readonly string[]): Promise<void> {
  await getDb()
    .update(notificationsTable)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notificationsTable.userId, userId),
        isNull(notificationsTable.readAt),
        ...(ids === undefined ? [] : [inArray(notificationsTable.id, [...ids])]),
      ),
    );
}
