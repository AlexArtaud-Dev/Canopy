import { RotateCw, WifiOff } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { BrandMark } from '@/features/shell';
import { Button } from '@/shared/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/shared/ui/empty';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pwa.offline');
  return { title: t('title') };
}

/**
 * What the installed app shows when the server cannot be reached: the service worker keeps this
 * page (and its styles) and answers with it when a navigation fails. It needs no script.
 */
export default async function OfflinePage() {
  const t = await getTranslations('pwa.offline');
  return (
    <main className="bg-muted/40 flex min-h-svh flex-col items-center justify-center gap-8 p-4">
      <div className="flex items-center gap-2.5">
        <span className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-lg">
          <BrandMark className="size-5" />
        </span>
        <span className="text-lg font-semibold tracking-tight">Canopy</span>
      </div>
      <Empty className="bg-card max-w-md border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <WifiOff aria-hidden />
          </EmptyMedia>
          <EmptyTitle>
            <h1>{t('title')}</h1>
          </EmptyTitle>
          <EmptyDescription>{t('description')}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild>
            {/* An empty link reloads the page the person was opening. */}
            <a href="">
              <RotateCw aria-hidden />
              {t('retry')}
            </a>
          </Button>
        </EmptyContent>
      </Empty>
    </main>
  );
}
