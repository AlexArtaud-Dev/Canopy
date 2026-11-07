import { FileQuestion, House } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

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
  const t = await getTranslations('common.notFound');
  return { title: t('title') };
}

export default async function NotFound() {
  const t = await getTranslations('common.notFound');

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <Empty className="max-w-md">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileQuestion aria-hidden />
          </EmptyMedia>
          <EmptyTitle>{t('title')}</EmptyTitle>
          <EmptyDescription>{t('description')}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild>
            <Link href="/">
              <House aria-hidden />
              {t('backHome')}
            </Link>
          </Button>
        </EmptyContent>
      </Empty>
    </main>
  );
}
