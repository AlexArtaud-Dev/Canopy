'use server';

import { runAction, type ActionResult } from '@/shared/lib/action';
import { AppBaseError } from '@/shared/lib/errors';
import { requireSession } from '@/features/auth';

import { markReadInputSchema, type NotificationView } from '../notifications.utils';
import { listNotifications, markRead } from './notifications-store';

/** The signed-in person's notifications, latest first. */
export async function loadNotifications(): Promise<ActionResult<NotificationView[]>> {
  return runAction(async () => {
    const session = await requireSession();
    return listNotifications(session.user.id);
  });
}

/**
 * Marks the person's own notifications read. Not audited: read marks only change what their own
 * bell shows, nothing anyone else sees or relies on.
 */
export async function markNotificationsRead(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const parsed = markReadInputSchema.safeParse(input);
    if (!parsed.success) throw new AppBaseError('system.bad_request', 'invalid input');
    const session = await requireSession();
    await markRead(session.user.id, parsed.data.ids);
    return null;
  });
}
