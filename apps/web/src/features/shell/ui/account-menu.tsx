'use client';

import { ChevronsUpDown, Languages, LogOut } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { localeNames, locales, type Locale } from '@/shared/i18n/locales';
import { themeChoices, themeIcons, type ThemeChoice } from '@/shared/theme/theme-choices';
import { Avatar, AvatarFallback } from '@/shared/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/shared/ui/sidebar';

export interface AccountSummary {
  name: string;
  username: string;
  initials: string;
  isAdmin: boolean;
}

interface AccountMenuProps {
  account: AccountSummary;
  theme: ThemeChoice;
  locale: Locale;
  pending: boolean;
  onThemeChange: (theme: ThemeChoice) => void;
  onLocaleChange: (locale: Locale) => void;
  onSignOut: () => void;
}

export function AccountMenu({
  account,
  theme,
  locale,
  pending,
  onThemeChange,
  onLocaleChange,
  onSignOut,
}: AccountMenuProps) {
  const t = useTranslations('shell.preferences');
  const accountT = useTranslations('auth.account');

  const identity = (
    <>
      <Avatar className="size-8 rounded-lg">
        <AvatarFallback className="rounded-lg text-xs font-medium">
          {account.initials}
        </AvatarFallback>
      </Avatar>
      <span className="grid flex-1 text-left leading-tight">
        <span className="truncate text-sm font-medium">{account.name}</span>
        <span className="text-muted-foreground truncate text-xs">
          @{account.username}
          {account.isAdmin && ` · ${accountT('administrator')}`}
        </span>
      </span>
    </>
  );

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              tooltip={accountT('menu')}
              aria-label={accountT('menu')}
              aria-busy={pending}
            >
              {identity}
              <ChevronsUpDown className="ml-auto size-4" aria-hidden />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="start"
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
          >
            <DropdownMenuLabel className="flex items-center gap-2 font-normal">
              {identity}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
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
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onSignOut}>
              <LogOut aria-hidden />
              {accountT('signOut')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
