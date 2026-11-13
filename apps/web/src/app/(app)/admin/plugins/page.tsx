import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { adminPermission } from '@/features/access/access.utils';
import { authorizePage } from '@/features/auth';
import { PluginsContainer } from '@/features/plugins';
import { loadPlugins } from '@/features/plugins/server/plugins-actions';
import { AccessDenied, PageHeader } from '@/features/shell';
import { ErrorState } from '@/shared/errors/error-state';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('shell.nav');
  return { title: t('plugins') };
}

/** Plugins installed from allowlisted GitHub releases (administrators only). */
export default async function PluginsPage() {
  if (!(await authorizePage(adminPermission))) return <AccessDenied />;
  const [nav, t, plugins] = await Promise.all([
    getTranslations('shell.nav'),
    getTranslations('plugins.page'),
    loadPlugins(),
  ]);
  return (
    <>
      <PageHeader title={nav('plugins')} />
      <main className="mx-auto grid w-full max-w-4xl grid-cols-1 gap-4 p-4 md:p-6">
        <p className="text-muted-foreground text-sm">{t('description')}</p>
        {plugins.ok ? (
          <PluginsContainer initial={plugins.data} />
        ) : (
          <ErrorState
            code={plugins.error.code}
            params={plugins.error.params}
            reference={
              plugins.error.code.startsWith('system.') ? plugins.error.requestId : undefined
            }
          />
        )}
      </main>
    </>
  );
}
