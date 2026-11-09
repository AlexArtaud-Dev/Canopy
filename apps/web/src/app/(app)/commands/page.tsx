import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { CommandsContainer } from '@/features/commands';
import { loadCommands } from '@/features/commands/server/commands-actions';
import { requireSession } from '@/features/auth';
import { PageHeader } from '@/features/shell';
import { ErrorState } from '@/shared/errors/error-state';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('shell.nav');
  return { title: t('commands') };
}

/** Tools installed on the server, run from the catalog with typed parameters. */
export default async function CommandsPage() {
  const [, nav, t, catalog] = await Promise.all([
    requireSession(),
    getTranslations('shell.nav'),
    getTranslations('commands.page'),
    loadCommands(),
  ]);
  return (
    <>
      <PageHeader title={nav('commands')} />
      <main className="mx-auto grid w-full max-w-6xl gap-4 p-4 md:p-6">
        <p className="text-muted-foreground text-sm">{t('description')}</p>
        {catalog.ok ? (
          <CommandsContainer catalog={catalog.data} />
        ) : (
          <ErrorState
            code={catalog.error.code}
            params={catalog.error.params}
            reference={
              catalog.error.code.startsWith('system.') ? catalog.error.requestId : undefined
            }
          />
        )}
      </main>
    </>
  );
}
