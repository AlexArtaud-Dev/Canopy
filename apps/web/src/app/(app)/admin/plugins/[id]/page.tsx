import type { Metadata } from 'next';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { ChevronLeft } from 'lucide-react';

import { adminPermission } from '@/features/access/access.utils';
import { authorizePage } from '@/features/auth';
import { localized } from '@/features/commands/commands.utils';
import { loadCommands } from '@/features/commands/server/commands-actions';
import { kindViews } from '@/features/devices';
import { loadAllDevices } from '@/features/devices/server/devices-actions';
import { PluginDetailContainer } from '@/features/plugins';
import { loadPlugins } from '@/features/plugins/server/plugins-actions';
import { loadSavedValues } from '@/features/plugins/server/saved-values-actions';
import { AccessDenied, PageHeader } from '@/features/shell';
import { ErrorState } from '@/shared/errors/error-state';
import { Button } from '@/shared/ui/button';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('shell.nav');
  return { title: t('plugins') };
}

/** One installed plugin: its defaults, devices, commands and state (administrators only). */
export default async function PluginPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await authorizePage(adminPermission))) return <AccessDenied />;
  const { id } = await params;
  const [nav, t, locale, plugins, catalog, devices, saved] = await Promise.all([
    getTranslations('shell.nav'),
    getTranslations('plugins.detail'),
    getLocale(),
    loadPlugins(),
    loadCommands(),
    loadAllDevices(),
    loadSavedValues(),
  ]);
  const failed = [plugins, catalog, devices, saved]
    .map((result) => (result.ok ? null : result.error))
    .find((error) => error !== null);
  const plugin = plugins.ok ? plugins.data.items.find((item) => item.id === id) : undefined;
  const commands = catalog.ok
    ? catalog.data.entries.filter((entry) => entry.plugin?.id === id)
    : [];
  const kinds = catalog.ok ? kindViews(commands, (text) => localized(text, locale)) : [];
  return (
    <>
      <PageHeader title={nav('plugins')} />
      <main className="mx-auto grid w-full max-w-4xl grid-cols-1 gap-4 p-4 md:p-6">
        <Button asChild variant="ghost" size="sm" className="justify-self-start">
          <Link href="/admin/plugins">
            <ChevronLeft aria-hidden />
            {t('back')}
          </Link>
        </Button>
        {failed ? (
          <ErrorState
            code={failed.code}
            params={failed.params}
            reference={failed.code.startsWith('system.') ? failed.requestId : undefined}
          />
        ) : plugin ? (
          <PluginDetailContainer
            initial={plugin}
            commands={commands}
            kinds={kinds}
            devices={
              devices.ok ? devices.data.devices.filter((device) => device.pluginId === id) : []
            }
            groups={devices.ok ? devices.data.groups : []}
            saved={saved.ok ? (saved.data[id] ?? {}) : {}}
          />
        ) : (
          <ErrorState code="plugins.not_found" />
        )}
      </main>
    </>
  );
}
