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
