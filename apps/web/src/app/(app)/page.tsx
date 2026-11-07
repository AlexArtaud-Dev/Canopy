import { FolderTree } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@/features/shell';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/shared/ui/empty';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('shell.nav');
  return { title: t('files') };
}

export default async function FilesPage() {
  const [nav, common] = await Promise.all([
    getTranslations('shell.nav'),
    getTranslations('common'),
  ]);

  return (
    <>
      <PageHeader title={nav('files')} />
      <main className="flex flex-1 p-4 md:p-6">
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderTree aria-hidden />
            </EmptyMedia>
            <EmptyTitle>{common('files.empty.title')}</EmptyTitle>
            <EmptyDescription>{common('files.empty.description')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </main>
    </>
  );
}
