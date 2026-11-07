import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

import { localeCookieName, resolveLocale, type Locale } from './locales';

/** One JSON file per feature; the file name is the message namespace. */
const namespaces = ['common', 'errors', 'shell', 'system'] as const;

async function loadMessages(locale: Locale): Promise<Record<string, unknown>> {
  const entries = await Promise.all(
    namespaces.map(async (namespace) => {
      const messages = (await import(`../../../messages/${locale}/${namespace}.json`)) as {
        default: unknown;
      };
      return [namespace, messages.default] as const;
    }),
  );
  return Object.fromEntries(entries);
}

export default getRequestConfig(async () => {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const locale = resolveLocale(
    cookieStore.get(localeCookieName)?.value,
    headerStore.get('accept-language'),
  );
  return { locale, messages: await loadMessages(locale) };
});
