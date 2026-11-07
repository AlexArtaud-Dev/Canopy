'use client';

import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { useTheme } from 'next-themes';
import { useTransition } from 'react';

import { isLocale, defaultLocale, type Locale } from '@/shared/i18n/locales';

import { setLocale } from './server/set-locale';
import { PreferencesMenu, themeChoices, type ThemeChoice } from './ui/preferences-menu';

function toThemeChoice(value: string | undefined): ThemeChoice {
  return themeChoices.find((choice) => choice === value) ?? 'system';
}

export function PreferencesContainer() {
  const router = useRouter();
  const currentLocale = useLocale();
  const { theme, setTheme } = useTheme();
  const [pending, startTransition] = useTransition();

  const handleLocaleChange = (locale: Locale) => {
    startTransition(async () => {
      await setLocale(locale);
      router.refresh();
    });
  };

  return (
    <PreferencesMenu
      theme={toThemeChoice(theme)}
      locale={isLocale(currentLocale) ? currentLocale : defaultLocale}
      pending={pending}
      onThemeChange={setTheme}
      onLocaleChange={handleLocaleChange}
    />
  );
}
