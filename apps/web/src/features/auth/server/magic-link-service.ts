import 'server-only';

import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { parseServerEnv } from '@/shared/config/env';
import { getDb } from '@/shared/db/client';
import { groupsTable } from '@/features/access/server/access.schema';
import { isMailConfigured } from '@/features/mail/mail.utils';
import { getMailSettings, sendMail } from '@/features/mail/server/mailer';
import { magicLinkEmail } from '@/features/mail/templates/templates';

import { magicLinkLifetimeSeconds } from '../auth.utils';
import { usersTable } from './auth.schema';

/** Offered on the sign-in page when e-mail works and at least one group allows it. */
export async function isMagicLinkAvailable(): Promise<boolean> {
  if (!isMailConfigured(await getMailSettings())) return false;
  const [group] = await getDb()
    .select({ id: groupsTable.id })
    .from(groupsTable)
    .where(eq(groupsTable.allowMagicLink, true))
    .limit(1);
  return group !== undefined;
}

/** The page the e-mailed link opens: it asks for a click, so link scanners cannot use it up. */
export function magicLinkUrl(token: string): string {
  const base = parseServerEnv(process.env).CANOPY_PUBLIC_URL.replace(/\/$/, '');
  return `${base}/login/link?token=${encodeURIComponent(token)}`;
}

const metadataSchema = z.object({ userId: z.string().min(1).max(64) });

/**
 * Better Auth's `sendMagicLink`: e-mails the link to the account's contact address, through the
 * outbox (themed, kept, retried) like every other e-mail.
 */
export async function deliverMagicLink(metadata: unknown, token: string): Promise<void> {
  const { userId } = metadataSchema.parse(metadata);
  const [user] = await getDb()
    .select({ name: usersTable.name, email: usersTable.contactEmail, locale: usersTable.locale })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (!user?.email) return;
  const email = await magicLinkEmail(user.locale, {
    name: user.name,
    link: magicLinkUrl(token),
    minutes: magicLinkLifetimeSeconds / 60,
  });
  await sendMail({ kind: 'magic_link', to: user.email, ...email });
}
