import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { headers } from 'next/headers';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { getAppearance } from '@/features/appearance';
import { cn } from '@/shared/lib/utils';
import { ThemeProvider } from '@/shared/theme/theme-provider';
import { Toaster } from '@/shared/ui/sonner';
import { TooltipProvider } from '@/shared/ui/tooltip';

import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('common');
  return {
    title: { default: 'Canopy', template: '%s · Canopy' },
    description: t('meta.description'),
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
      suppressHydrationWarning
      className={cn(GeistSans.variable, GeistMono.variable, 'font-sans antialiased')}
    >
      <body>
        <NextIntlClientProvider>
          <ThemeProvider nonce={nonce} defaultTheme={appearance.defaultMode}>
            <TooltipProvider delayDuration={300}>
              {children}
              <Toaster />
            </TooltipProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
