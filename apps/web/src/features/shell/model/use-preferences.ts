'use client';

import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { useTheme } from 'next-themes';
import { useTransition } from 'react';

import { defaultLocale, isLocale, type Locale } from '@/shared/i18n/locales';
import { toThemeChoice, type ThemeChoice } from '@/shared/theme/theme-choices';

import { setLocale } from '../server/set-locale';

/** Theme (per browser) and language (cookie, re-rendered on the server) of the current user. */
export function usePreferences() {
  const router = useRouter();
  const currentLocale = useLocale();
  const { theme, setTheme } = useTheme();
  const [pending, startTransition] = useTransition();

  const changeLocale = (locale: Locale) => {
    startTransition(async () => {
      await setLocale(locale);
      router.refresh();
    });
  };

  return {
    theme: toThemeChoice(theme),
    locale: isLocale(currentLocale) ? currentLocale : defaultLocale,
    pending,
    changeTheme: (next: ThemeChoice) => {
      setTheme(next);
    },
    changeLocale,
  };
}
