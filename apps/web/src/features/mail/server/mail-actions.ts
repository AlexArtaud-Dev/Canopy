'use server';

import { getLocale } from 'next-intl/server';

import { runAction, type ActionResult } from '@/shared/lib/action';
import { AppBaseError } from '@/shared/lib/errors';
import { audit } from '@/features/audit/server/audit-writer';
import { authorize } from '@/features/auth';
import { getSettings, updateSetting } from '@/features/settings/server/settings-store';

import { mailSettings } from '../mail.settings';
import { smtpFormSchema, testMailSchema } from '../mail.utils';
import { testEmail } from '../templates/templates';
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
