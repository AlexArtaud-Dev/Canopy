'use client';

import { NextIntlClientProvider } from 'next-intl';
import { useSyncExternalStore } from 'react';

import { ErrorState } from '@/shared/errors/error-state';
import { localeCookieName, resolveLocale, type Locale } from '@/shared/i18n/locales';
import { unexpectedErrorCode } from '@/shared/lib/errors';

import enCommon from '../../messages/en/common.json';
import enErrors from '../../messages/en/errors.json';
import esCommon from '../../messages/es/common.json';
import esErrors from '../../messages/es/errors.json';
import frCommon from '../../messages/fr/common.json';
import frErrors from '../../messages/fr/errors.json';

import './globals.css';

// The root layout (and its i18n provider) failed, so this boundary carries its own small catalog.
const messages = {
  en: { common: enCommon, errors: enErrors },
  fr: { common: frCommon, errors: frErrors },
  es: { common: esCommon, errors: esErrors },
} satisfies Record<Locale, unknown>;

const noopSubscribe = () => () => undefined;

function browserLocale(): Locale {
  const cookie = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${localeCookieName}=`))
    ?.split('=')[1];
  return resolveLocale(cookie, navigator.languages.join(','));
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const locale = useSyncExternalStore(noopSubscribe, browserLocale, (): Locale => 'en');

  return (
    <html lang={locale}>
      <body className="bg-background text-foreground flex min-h-svh items-center justify-center p-4 font-sans">
        <NextIntlClientProvider locale={locale} messages={messages[locale]}>
          <ErrorState code={unexpectedErrorCode} reference={error.digest} onRetry={reset} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
