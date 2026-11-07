'use client';

import { useTransition } from 'react';

import { usePreferences } from './model/use-preferences';
import { AccountMenu, type AccountSummary } from './ui/account-menu';

interface AccountContainerProps {
  account: AccountSummary;
  /** Server action ending the session (passed in so the shell does not depend on auth). */
  signOutAction: () => Promise<void>;
}

export function AccountContainer({ account, signOutAction }: AccountContainerProps) {
  const preferences = usePreferences();
  const [signingOut, startSignOut] = useTransition();

  return (
    <AccountMenu
      account={account}
      theme={preferences.theme}
      locale={preferences.locale}
      pending={preferences.pending || signingOut}
      onThemeChange={preferences.changeTheme}
      onLocaleChange={preferences.changeLocale}
      onSignOut={() => {
        startSignOut(() => signOutAction());
      }}
    />
  );
}
