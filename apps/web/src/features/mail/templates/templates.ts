import 'server-only';

import { createTranslator } from 'next-intl';

import { defaultLocale, isLocale, type Locale } from '@/shared/i18n/locales';

import type emailMessages from '../../../../messages/en/emails.json';
import { renderEmail, type RenderedEmail } from './layout';

// i18n-dynamic: emails — rendered with createTranslator in the recipient's locale.

async function translatorFor(locale: string | null | undefined) {
  const resolved: Locale = locale && isLocale(locale) ? locale : defaultLocale;
  const messages = (await import(`../../../../messages/${resolved}/emails.json`)) as {
    default: typeof emailMessages;
  };
  return createTranslator({
    locale: resolved,
    messages: { emails: messages.default },
    namespace: 'emails',
  });
}

/** Confirms SMTP works; sent from Administration › Email. */
export async function testEmail(locale: string | null | undefined): Promise<RenderedEmail> {
  const t = await translatorFor(locale);
  return renderEmail(t('test.subject'), {
    title: t('test.title'),
    preheader: t('test.preheader'),
    paragraphs: [t('test.body')],
    footer: t('footer.admin'),
  });
}

export async function invitationEmail(
  locale: string | null | undefined,
  values: { name: string; link: string },
): Promise<RenderedEmail> {
  const t = await translatorFor(locale);
  return renderEmail(t('invitation.subject'), {
    title: t('invitation.title', { name: values.name }),
    preheader: t('invitation.preheader'),
    paragraphs: [t('invitation.body'), t('invitation.expiry')],
    action: { label: t('invitation.action'), url: values.link },
    footer: t('footer.admin'),
  });
}

export async function passwordResetEmail(
  locale: string | null | undefined,
  values: { name: string; link: string },
): Promise<RenderedEmail> {
  const t = await translatorFor(locale);
  return renderEmail(t('reset.subject'), {
    title: t('reset.title', { name: values.name }),
    preheader: t('reset.preheader'),
    paragraphs: [t('reset.body'), t('reset.expiry'), t('reset.ignore')],
    action: { label: t('reset.action'), url: values.link },
    footer: t('footer.account'),
  });
}

export const securityNoticeKinds = [
  'password_changed',
  'two_factor_enabled',
  'two_factor_disabled',
  'new_sign_in',
] as const;
export type SecurityNoticeKind = (typeof securityNoticeKinds)[number];

export async function securityNoticeEmail(
  locale: string | null | undefined,
  kind: SecurityNoticeKind,
  values: { name: string; device: string; ipAddress: string },
): Promise<RenderedEmail> {
  const t = await translatorFor(locale);
  return renderEmail(t(`security.${kind}.subject`), {
    title: t(`security.${kind}.title`, { name: values.name }),
    preheader: t(`security.${kind}.subject`),
    paragraphs: [
      t(`security.${kind}.body`),
      t('security.details', { device: values.device, ipAddress: values.ipAddress }),
      t('security.notYou'),
    ],
    footer: t('footer.account'),
  });
}
