import { Construction } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { BrandMark } from '@/features/shell';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/shared/ui/empty';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('system.maintenance');
  return { title: t('title') };
}

/** Shown (with a 503) to everyone outside the local network while maintenance is on. */
export default async function MaintenancePage() {
  const t = await getTranslations('system.maintenance');
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
            <Construction aria-hidden />
          </EmptyMedia>
          <EmptyTitle>
            <h1>{t('title')}</h1>
          </EmptyTitle>
          <EmptyDescription>{t('description')}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </main>
  );
}
