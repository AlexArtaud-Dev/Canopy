import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { browserQuerySchema, FileBrowserContainer, listFolder } from '@/features/files';
import { PageHeader } from '@/features/shell';
import { ErrorState } from '@/shared/errors/error-state';
import { Button } from '@/shared/ui/button';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('shell.nav');
  return { title: t('files') };
}

interface FilesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** The first page of the folder is rendered on the server so it paints at once. */
export default async function FilesPage({ searchParams }: FilesPageProps) {
  const query = browserQuerySchema.parse(await searchParams);
  const [nav, t, firstPage] = await Promise.all([
    getTranslations('shell.nav'),
    getTranslations('files.browser'),
    listFolder({ ...query, offset: 0 }),
  ]);

  return (
    <>
      <PageHeader title={nav('files')} />
      {/* Exactly the viewport below the 3.5 rem header: the file list scrolls, not the window. */}
      <main className="flex h-[calc(100svh-3.5rem)] min-h-0 flex-col">
        {firstPage.ok ? (
          <FileBrowserContainer
            key={JSON.stringify(query)}
            query={query}
            firstPage={firstPage.data}
          />
        ) : (
          <div className="p-4 md:p-6">
            <ErrorState
              code={firstPage.error.code}
              params={firstPage.error.params}
              reference={
                firstPage.error.code.startsWith('system.') ? firstPage.error.requestId : undefined
              }
            >
              {query.path !== '/' && (
                <Button asChild variant="outline">
                  <Link href="/">{t('backToRoot')}</Link>
                </Button>
              )}
            </ErrorState>
          </div>
        )}
      </main>
    </>
  );
}
