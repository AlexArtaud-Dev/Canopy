import { ShieldAlert } from 'lucide-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { SetupContainer, setupBlocker } from '@/features/auth';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/shared/ui/empty';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.setup');
  return { title: t('metaTitle') };
}

export default async function SetupPage() {
  const blocker = await setupBlocker();
  if (blocker === 'already_done') redirect('/login');
  if (blocker === 'not_local') {
    const t = await getTranslations('auth.setup.notLocal');
    return (
      <Empty className="bg-card max-w-md border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ShieldAlert aria-hidden />
          </EmptyMedia>
          <EmptyTitle>{t('title')}</EmptyTitle>
          <EmptyDescription>{t('description')}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return <SetupContainer />;
}
