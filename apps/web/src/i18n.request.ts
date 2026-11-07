// next-intl request config (composition root: may read feature settings, unlike shared/).
import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

import { getAppearance } from '@/features/appearance';
import { localeCookieName, resolveLocale, type Locale } from '@/shared/i18n/locales';

/** One JSON file per feature; the file name is the message namespace. */
const namespaces = [
  'access',
  'auth',
  'common',
  'errors',
  'files',
  'shell',
  'system',
  'users',
] as const;

async function loadMessages(locale: Locale): Promise<Record<string, unknown>> {
  const entries = await Promise.all(
    namespaces.map(async (namespace) => {
      const messages = (await import(`../messages/${locale}/${namespace}.json`)) as {
        default: unknown;
      };
      return [namespace, messages.default] as const;
    }),
  );
  return Object.fromEntries(entries);
}

export default getRequestConfig(async () => {
  const [cookieStore, headerStore, appearance] = await Promise.all([
    cookies(),
    headers(),
    getAppearance(),
  ]);
  const locale = resolveLocale(
    cookieStore.get(localeCookieName)?.value,
    headerStore.get('accept-language'),
    appearance.defaultLocale,
  );
  return { locale, messages: await loadMessages(locale) };
});
