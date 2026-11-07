import 'server-only';

import { desc, eq } from 'drizzle-orm';
import { headers } from 'next/headers';

import { getDb } from '@/shared/db/client';
import { logger } from '@/shared/lib/logger';
import { getRequestContext } from '@/shared/request/request-context';
import { sendMail } from '@/features/mail/server/mailer';
import { securityNoticeEmail, type SecurityNoticeKind } from '@/features/mail/templates/templates';

import { describeUserAgent } from '../account.utils';
import { isNewDevice } from '../action-token.utils';
import { sessionsTable, usersTable } from './auth.schema';

const log = logger.child({ module: 'auth' });

function deviceLabel(userAgent: string | null): string {
  const { browser, os } = describeUserAgent(userAgent);
  return [browser, os].filter(Boolean).join(' · ') || '?';
}

/**
 * Emails a security notice to the account's own address, when it has one. Never fails the
 * calling action: a notice that cannot be sent is logged and stays in the outbox for retries.
 */
export async function notifySecurity(userId: string, kind: SecurityNoticeKind): Promise<void> {
  try {
    const [user] = await getDb()
      .select({ name: usersTable.name, email: usersTable.contactEmail, locale: usersTable.locale })
      .from(usersTable)
      .where(eq(usersTable.id, userId));
    if (!user?.email) return;
    const [context, headerStore] = await Promise.all([getRequestContext(), headers()]);
    const email = await securityNoticeEmail(user.locale, kind, {
      name: user.name,
      device: deviceLabel(headerStore.get('user-agent')),
      ipAddress: context.clientIp ?? '?',
    });
    await sendMail({ kind: `security.${kind}`, to: user.email, ...email });
  } catch (error) {
    log.warn('security notice not sent', { kind, error });
  }
}

/** After a sign-in: notice when no other session shares this browser, OS and address. */
export async function notifyIfNewDevice(userId: string): Promise<void> {
  const sessions = await getDb()
    .select({ userAgent: sessionsTable.userAgent, ipAddress: sessionsTable.ipAddress })
    .from(sessionsTable)
    .where(eq(sessionsTable.userId, userId))
    .orderBy(desc(sessionsTable.createdAt));
  const [current, ...others] = sessions.map((session) => ({
    device: deviceLabel(session.userAgent),
    ipAddress: session.ipAddress,
  }));
  // The very first sign-in of an account is expected, not suspicious.
  if (!current || others.length === 0) return;
  if (isNewDevice(current, others)) await notifySecurity(userId, 'new_sign_in');
}
