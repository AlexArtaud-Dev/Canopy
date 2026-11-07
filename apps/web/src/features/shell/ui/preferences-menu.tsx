'use client';

import { ChevronsUpDown, Languages, Monitor, Moon, Settings2, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { locales, type Locale } from '@/shared/i18n/locales';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/shared/ui/sidebar';

export const themeChoices = ['light', 'dark', 'system'] as const;
export type ThemeChoice = (typeof themeChoices)[number];

const themeIcons = { light: Sun, dark: Moon, system: Monitor } as const;

/** Endonyms: a language is always listed in its own language so users can find it. */
const localeNames: Record<Locale, string> = { en: 'English', fr: 'Français', es: 'Español' };

interface PreferencesMenuProps {
  theme: ThemeChoice;
  locale: Locale;
  pending: boolean;
  onThemeChange: (theme: ThemeChoice) => void;
  onLocaleChange: (locale: Locale) => void;
}

export function PreferencesMenu({
  theme,
  locale,
  pending,
  onThemeChange,
  onLocaleChange,
}: PreferencesMenuProps) {
  const t = useTranslations('shell.preferences');

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" tooltip={t('title')} aria-busy={pending}>
              <span className="bg-muted flex aspect-square size-8 items-center justify-center rounded-lg">
                <Settings2 className="size-4" aria-hidden />
              </span>
              <span className="grid flex-1 text-left leading-tight">
                <span className="truncate text-sm font-medium">{t('title')}</span>
                <span className="text-muted-foreground truncate text-xs">
                  {t(`themes.${theme}`)} · {localeNames[locale]}
                </span>
              </span>
              <ChevronsUpDown className="ml-auto size-4" aria-hidden />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="start"
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
          >
            <DropdownMenuLabel>{t('appearance')}</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={theme}
              onValueChange={(value) => {
                const next = themeChoices.find((choice) => choice === value);
                if (next) onThemeChange(next);
              }}
            >
              {themeChoices.map((choice) => {
                const Icon = themeIcons[choice];
                return (
                  <DropdownMenuRadioItem key={choice} value={choice}>
                    <Icon aria-hidden />
                    {t(`themes.${choice}`)}
                  </DropdownMenuRadioItem>
                );
              })}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="flex items-center gap-2">
              <Languages className="size-4" aria-hidden />
              {t('language')}
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={locale}
              onValueChange={(value) => {
                const next = locales.find((candidate) => candidate === value);
                if (next) onLocaleChange(next);
              }}
            >
              {locales.map((candidate) => (
                <DropdownMenuRadioItem
                  key={candidate}
                  value={candidate}
                  lang={candidate}
                  disabled={pending}
                >
                  {localeNames[candidate]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
