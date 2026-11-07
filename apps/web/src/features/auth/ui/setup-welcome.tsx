'use client';

import { cn } from 'cn';
import { ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { localeNames, locales, type Locale } from '@/shared/i18n/locales';
import { themeChoices, themeIcons, type ThemeChoice } from '@/shared/theme/theme-choices';
import { Button } from '@/shared/ui/button';
import { FieldGroup, FieldLegend, FieldSet } from '@/shared/ui/field';

interface SetupWelcomeProps {
  locale: Locale;
  theme: ThemeChoice;
  pending: boolean;
  onLocaleChange: (locale: Locale) => void;
  onThemeChange: (theme: ThemeChoice) => void;
  onNext: () => void;
}

function optionClass(selected: boolean): string {
  return cn(
    'h-auto flex-1 justify-center py-2.5',
    selected &&
      'border-primary bg-primary/10 ring-primary hover:bg-primary/15 dark:border-primary dark:bg-primary/15 dark:hover:bg-primary/20 ring-1',
  );
}

export function SetupWelcome({
  locale,
  theme,
  pending,
  onLocaleChange,
  onThemeChange,
  onNext,
}: SetupWelcomeProps) {
  const t = useTranslations('auth.setup.welcome');
  const themesT = useTranslations('shell.preferences.themes');

  return (
    <FieldGroup>
      <FieldSet>
        <FieldLegend variant="label">{t('language')}</FieldLegend>
        <div className="flex flex-wrap gap-2">
          {locales.map((candidate) => (
            <Button
              key={candidate}
              type="button"
              variant="outline"
              lang={candidate}
              aria-pressed={candidate === locale}
              disabled={pending}
              className={optionClass(candidate === locale)}
              onClick={() => {
                onLocaleChange(candidate);
              }}
            >
              {localeNames[candidate]}
            </Button>
          ))}
        </div>
      </FieldSet>
      <FieldSet>
        <FieldLegend variant="label">{t('theme')}</FieldLegend>
        <div className="flex flex-wrap gap-2">
          {themeChoices.map((choice) => {
            const Icon = themeIcons[choice];
            return (
              <Button
                key={choice}
                type="button"
                variant="outline"
                aria-pressed={choice === theme}
                className={optionClass(choice === theme)}
                onClick={() => {
                  onThemeChange(choice);
                }}
              >
                <Icon aria-hidden />
                {themesT(choice)}
              </Button>
            );
          })}
        </div>
      </FieldSet>
      <Button size="lg" className="w-full" onClick={onNext}>
        {t('next')}
        <ArrowRight aria-hidden data-icon="inline-end" />
      </Button>
    </FieldGroup>
  );
}
