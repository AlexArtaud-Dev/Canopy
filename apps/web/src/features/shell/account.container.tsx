'use client';

import { useTransition } from 'react';

import { isNewSince, useLastSeenRelease } from '@/features/whats-new';

import { usePreferences } from './model/use-preferences';
import { AccountMenu, type AccountSummary } from './ui/account-menu';

interface AccountContainerProps {
  account: AccountSummary;
  /** Server action ending the session (passed in so the shell does not depend on auth). */
  signOutAction: () => Promise<void>;
  /** Newest released version, for the "What's new" badge. */
  latestRelease: string | null;
}

export function AccountContainer({ account, signOutAction, latestRelease }: AccountContainerProps) {
  const preferences = usePreferences();
  const [lastSeen] = useLastSeenRelease();
  // Unknown until storage is read: no badge flashes on the first render.
  const newsUnseen =
    latestRelease !== null && lastSeen !== undefined && isNewSince(latestRelease, lastSeen);
  const [signingOut, startSignOut] = useTransition();

  return (
    <AccountMenu
      account={account}
      theme={preferences.theme}
      locale={preferences.locale}
      pending={preferences.pending || signingOut}
      onThemeChange={preferences.changeTheme}
      onLocaleChange={preferences.changeLocale}
      newsUnseen={newsUnseen}
      onSignOut={() => {
        startSignOut(() => signOutAction());
      }}
    />
  );
}
