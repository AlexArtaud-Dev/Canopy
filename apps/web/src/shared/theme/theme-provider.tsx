'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ReactNode } from 'react';

import type { ThemeChoice } from './theme-choices';

/** `nonce` lets the no-flash theme script run under the strict CSP. */
export function ThemeProvider({
  children,
  nonce,
  defaultTheme = 'system',
}: {
  children: ReactNode;
  nonce?: string | undefined;
  /** Instance default (appearance settings) until the visitor picks a mode. */
  defaultTheme?: ThemeChoice;
}) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme={defaultTheme}
      enableSystem
      disableTransitionOnChange
      {...(nonce ? { nonce } : {})}
    >
      {children}
    </NextThemesProvider>
  );
}
