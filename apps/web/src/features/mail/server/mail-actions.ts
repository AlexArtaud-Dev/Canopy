'use server';

import { getLocale } from 'next-intl/server';

import { runAction, type ActionResult } from '@/shared/lib/action';
import { AppBaseError } from '@/shared/lib/errors';
import { audit } from '@/features/audit/server/audit-writer';
import { authorize } from '@/features/auth';
import { getSettings, updateSetting } from '@/features/settings/server/settings-store';

import { mailSettings } from '../mail.settings';
import { outboxIdSchema, smtpFormSchema, testMailSchema } from '../mail.utils';
import { testEmail } from '../templates/templates';
import { findOutboxMessage, type OutboxMessage } from './mail-store';
import { sendMail } from './mailer';

/** Saves the SMTP form: only changed, unlocked fields; an empty password keeps the stored one. */
export async function saveSmtpSettings(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const parsed = smtpFormSchema.safeParse(input);
    if (!parsed.success) throw new AppBaseError('system.bad_request', 'invalid SMTP settings');
    const { user } = await authorize('mail:update');
    const { values, locked } = await getSettings('mail', mailSettings);
    for (const [key, value] of Object.entries(parsed.data)) {
      if (locked.has(key)) continue;
      if (key === 'password' && value === '') continue;
      if (values[key as keyof typeof values] === value) continue;
      // Each change is validated, encrypted when sensitive, broadcast and audited.
      await updateSetting('mail', mailSettings, key, value, user.id);
    }
    return null;
  });
}

export async function sendTestEmail(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const parsed = testMailSchema.safeParse(input);
    if (!parsed.success) throw new AppBaseError('system.bad_request', 'invalid recipient');
    const { user } = await authorize('mail:update');
    const email = await testEmail(await getLocale());
    const outcome = await sendMail({ kind: 'test', to: parsed.data.to, ...email });
    await audit({
      action: 'mail.test_send',
      result: outcome.ok ? 'success' : 'error',
      actorId: user.id,
      meta: outcome.ok ? {} : { code: outcome.code },
    });
    if (!outcome.ok) throw new AppBaseError(outcome.code, 'test email not delivered');
    return null;
  });
}

/**
 * Stored e-mails can hold sign-in links (invitations, password resets): reading or sending one
 * again is for administrators only, and audited, so no lesser right can take over an account.
 */
async function adminMessage(input: unknown) {
  const parsed = outboxIdSchema.safeParse(input);
  if (!parsed.success) throw new AppBaseError('system.bad_request', 'invalid e-mail id');
  const session = await authorize('system:admin');
  const message = await findOutboxMessage(parsed.data.id);
  if (!message) throw new AppBaseError('mail.not_found', 'no such e-mail');
  return { session, message };
}

/** One stored e-mail with its content (HTML and text). */
export async function readOutboxMessage(input: unknown): Promise<ActionResult<OutboxMessage>> {
  return runAction(async () => {
    const { session, message } = await adminMessage(input);
    await audit({
      action: 'mail.view',
      result: 'success',
      actorId: session.user.id,
      target: message.id,
    });
    return message;
  });
}

/** Sends a stored e-mail again, as a new message (the original stays in the list). */
export async function resendOutboxMessage(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { session, message } = await adminMessage(input);
    const outcome = await sendMail({
      kind: message.kind,
      to: message.recipient,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    await audit({
      action: 'mail.resend',
      result: outcome.ok ? 'success' : 'error',
      actorId: session.user.id,
      target: message.id,
      meta: outcome.ok ? {} : { code: outcome.code },
    });
    if (!outcome.ok) throw new AppBaseError(outcome.code, 'e-mail not delivered');
    return null;
  });
}
