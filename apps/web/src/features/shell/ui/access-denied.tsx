import { House, ShieldOff } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { Button } from '@/shared/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/shared/ui/empty';

import { PageHeader } from './page-header';

/** Shown by a page the user lacks the permission for (the refusal is already audited). */
export function AccessDenied() {
  const t = useTranslations('common.accessDenied');
  return (
    <>
      <PageHeader title={t('title')} />
      <main className="flex flex-1 items-center justify-center p-4 md:p-6">
        <Empty className="max-w-md border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShieldOff aria-hidden />
            </EmptyMedia>
            <EmptyTitle>{t('title')}</EmptyTitle>
            <EmptyDescription>{t('description')}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild variant="outline">
              <Link href="/">
                <House aria-hidden data-icon="inline-start" />
                {t('backHome')}
              </Link>
            </Button>
          </EmptyContent>
        </Empty>
      </main>
    </>
  );
}
