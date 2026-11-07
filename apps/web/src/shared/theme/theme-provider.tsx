'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ReactNode } from 'react';

/** `nonce` lets the no-flash theme script run under the strict CSP. */
export function ThemeProvider({
  children,
  nonce,
}: {
  children: ReactNode;
  nonce?: string | undefined;
}) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...(nonce ? { nonce } : {})}
    >
      {children}
    </NextThemesProvider>
  );
}
