'use client';

import { ChevronsUpDown, Languages, LogOut, Sparkles, UserRound } from 'lucide-react';
import Link from 'next/link';
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
  /** A release came out since the person last opened "What's new". */
  newsUnseen: boolean;
}

export function AccountMenu({
  account,
  theme,
  locale,
  pending,
  onThemeChange,
  onLocaleChange,
  onSignOut,
  newsUnseen,
}: AccountMenuProps) {
  const t = useTranslations('shell.preferences');
  const accountT = useTranslations('auth.account');

  const identity = (
    <>
      <span className="relative">
        <Avatar className="size-8 rounded-lg">
          <AvatarFallback className="rounded-lg text-xs font-medium">
            {account.initials}
          </AvatarFallback>
        </Avatar>
        {newsUnseen && (
          <span
            aria-hidden
            className="bg-primary ring-sidebar absolute -top-0.5 -right-0.5 size-2.5 rounded-full ring-2"
          />
        )}
      </span>
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
            <SidebarMenuButton size="lg" tooltip={accountT('menu')} aria-busy={pending}>
              {identity}
              {/* The visible name stays part of the accessible name (WCAG 2.5.3). */}
              <span className="sr-only">
                {newsUnseen ? accountT('menuWithNews') : accountT('menu')}
              </span>
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
            <DropdownMenuItem asChild>
              <Link href="/account">
                <UserRound aria-hidden />
                {accountT('open')}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/whats-new">
                <Sparkles aria-hidden />
                {accountT('whatsNew')}
                {newsUnseen && (
                  <span className="bg-primary text-primary-foreground ms-auto rounded-full px-1.5 text-[10px] font-medium">
                    {accountT('newBadge')}
                  </span>
                )}
              </Link>
            </DropdownMenuItem>
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
