'use server';

import { and, eq, or, sql } from 'drizzle-orm';
import { getLocale } from 'next-intl/server';
import { z } from 'zod';

import { getDb } from '@/shared/db/client';
import { runAction, type ActionResult } from '@/shared/lib/action';
import { AppBaseError } from '@/shared/lib/errors';
import { enforceRateLimit } from '@/shared/rate-limit/rate-limit';
import { getRequestContext } from '@/shared/request/request-context';
import { audit } from '@/features/audit/server/audit-writer';
import { sendMail } from '@/features/mail/server/mailer';
import { passwordResetEmail } from '@/features/mail/templates/templates';

import { actionTokenSchema, forgotPasswordSchema } from '../action-token.utils';
import { passwordSchema } from '../auth.utils';
import { consumeActionToken, issueActionToken } from './action-tokens';
import { accountsTable, sessionsTable, usersTable } from './auth.schema';
import { getConfiguredAuth } from './current-session';
import { hashPassword } from './password';
import { assertPasswordAllowed } from './password-policy';
import { notifySecurity } from './security-notices';

const publicRule = { limit: 5, windowSeconds: 15 * 60 };

async function limitByAddress(scope: string): Promise<void> {
  const { clientIp } = await getRequestContext();
  await enforceRateLimit(scope, clientIp ?? 'unknown', publicRule);
}

/**
 * "Forgot password": emails a reset link when the account exists, is enabled and has an email.
 * The answer never says whether it did, so the form cannot be used to probe accounts.
 */
export async function requestPasswordReset(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const parsed = forgotPasswordSchema.safeParse(input);
    if (!parsed.success) throw new AppBaseError('system.bad_request', 'invalid identifier');
    await limitByAddress('auth.password_reset');
    const identifier = parsed.data.identifier.toLowerCase();
    const [user] = await getDb()
      .select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.contactEmail,
        locale: usersTable.locale,
        disabled: usersTable.disabled,
      })
      .from(usersTable)
      .where(
        or(
          eq(usersTable.username, identifier),
          eq(sql`lower(${usersTable.contactEmail})`, identifier),
        ),
      )
      .limit(1);
    const eligible = user?.email && !user.disabled ? user : null;
    if (eligible?.email) {
      const { link } = await issueActionToken(eligible.id, 'password_reset');
      const email = await passwordResetEmail(eligible.locale ?? (await getLocale()), {
        name: eligible.name,
        link,
      });
      await sendMail({ kind: 'password_reset', to: eligible.email, ...email });
    }
    await audit({
      action: 'auth.password_reset_request',
      result: eligible ? 'success' : 'denied',
      actorId: eligible?.id ?? null,
    });
    return null;
  });
}

const setPasswordInput = z
  .object({ token: actionTokenSchema, password: z.string(), confirmPassword: z.string() })
  .refine((value) => value.password === value.confirmPassword, { path: ['confirmPassword'] });

/** Sets a password from an invitation or reset link, then signs the account out everywhere. */
export async function setPasswordWithToken(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const parsed = setPasswordInput.safeParse(input);
    if (!parsed.success) throw new AppBaseError('system.bad_request', 'invalid input');
    await limitByAddress('auth.set_password');
    const { policy } = await getConfiguredAuth();
    if (!passwordSchema(policy.passwordMinLength).safeParse(parsed.data.password).success) {
      throw new AppBaseError('system.bad_request', 'password outside the policy');
    }
    await assertPasswordAllowed(parsed.data.password, policy);
    const used = await consumeActionToken(parsed.data.token);
    if (!used) throw new AppBaseError('auth.link_invalid', 'link invalid, used or expired');

    const hash = await hashPassword(parsed.data.password);
    await getDb().transaction(async (tx) => {
      await tx
        .update(accountsTable)
        .set({ password: hash, updatedAt: new Date() })
        .where(
          and(eq(accountsTable.userId, used.userId), eq(accountsTable.providerId, 'credential')),
        );
      await tx.delete(sessionsTable).where(eq(sessionsTable.userId, used.userId));
    });
    await audit({
      action: 'auth.password_set',
      result: 'success',
      actorId: used.userId,
      meta: { purpose: used.purpose },
    });
    if (used.purpose === 'password_reset') await notifySecurity(used.userId, 'password_changed');
    return null;
  });
}
