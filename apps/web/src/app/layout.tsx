import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { headers } from 'next/headers';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { getAppearance } from '@/features/appearance';
import { InstallSupport } from '@/features/pwa';
import { cn } from '@/shared/lib/utils';
import { themeIconPath } from '@/shared/theme/theme-icon';
import { ThemeProvider } from '@/shared/theme/theme-provider';
import { Toaster } from '@/shared/ui/sonner';
import { TooltipProvider } from '@/shared/ui/tooltip';

import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const [t, appearance] = await Promise.all([getTranslations('common'), getAppearance()]);
  return {
    // The tab icon takes the instance's colour theme.
    icons: { icon: [{ url: themeIconPath(appearance.colorTheme), type: 'image/svg+xml' }] },
    title: { default: 'Canopy', template: 'Canopy · %s' },
    description: t('meta.description'),
    applicationName: 'Canopy',
    // iOS reads these instead of the manifest: full screen from the home screen, status bar kept.
    appleWebApp: { capable: true, title: 'Canopy', statusBarStyle: 'default' },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: 'black' },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [locale, headerStore, appearance] = await Promise.all([
    getLocale(),
    headers(),
    getAppearance(),
  ]);
  const nonce = headerStore.get('x-nonce') ?? undefined;

  return (
    <html
      lang={locale}
      // The default tokens are "canopy"; other themes override them via [data-theme].
      data-theme={appearance.colorTheme === 'canopy' ? undefined : appearance.colorTheme}
      data-surface={appearance.surfaceStyle}
      suppressHydrationWarning
      className={cn(GeistSans.variable, GeistMono.variable, 'font-sans antialiased')}
    >
      <body>
        <NextIntlClientProvider>
          <ThemeProvider nonce={nonce} defaultTheme={appearance.defaultMode}>
            <TooltipProvider delayDuration={300}>
              {children}
              {/* Top: the operations panel owns the bottom of the screen (full width on phones). */}
              <Toaster position="top-center" />
              <InstallSupport />
            </TooltipProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
