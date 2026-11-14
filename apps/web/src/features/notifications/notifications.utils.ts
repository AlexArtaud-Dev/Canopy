import { z } from 'zod';

/** The kinds of events the bell knows; each has its texts under `notifications.kinds`. */
export const notificationKinds = ['dropOffReceived'] as const;
export type NotificationKind = (typeof notificationKinds)[number];

/** Notifications are forgotten after this long, read or not. */
export const notificationRetentionMs = 90 * 24 * 60 * 60_000;

/** The most the bell lists; older ones remain until the retention ends. */
export const notificationListLimit = 50;

/** One notification as the bell shows it. */
export interface NotificationView {
  id: string;
  kind: NotificationKind;
  params: Record<string, string | number>;
  href: string | null;
  read: boolean;
  /** ISO 8601: when it last changed. */
  updatedAt: string;
}

export function isNotificationKind(value: string): value is NotificationKind {
  return notificationKinds.some((kind) => kind === value);
}

/** Only in-app paths: a notification never sends anyone to another site. */
export function safeHref(href: string | null): string | null {
  if (href === null || !href.startsWith('/') || href.startsWith('//')) return null;
  return href;
}

/** A stored in-app path split for a link: its path and its query (kept, not encoded away). */
export function linkTarget(href: string): { pathname: string; query: Record<string, string> } {
  const url = new URL(href, 'http://canopy.invalid');
  return { pathname: url.pathname, query: Object.fromEntries(url.searchParams) };
}

/** The unread ones, for the bell's badge. */
export function unreadCount(items: readonly Pick<NotificationView, 'read'>[]): number {
  return items.filter((item) => !item.read).length;
}

/** Marks given notifications read, or all of them when no ids are given. */
export const markReadInputSchema = z.object({
  ids: z.array(z.uuid()).max(notificationListLimit).optional(),
});
