import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';

import { adminPermission } from '@/features/access/access.utils';
import { authorizePage } from '@/features/auth';
import { localized } from '@/features/commands/commands.utils';
import { loadCommands } from '@/features/commands/server/commands-actions';
import { DevicesContainer, kindViews } from '@/features/devices';
import { loadAllDevices } from '@/features/devices/server/devices-actions';
import { AccessDenied, PageHeader } from '@/features/shell';
import { ErrorState } from '@/shared/errors/error-state';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('shell.nav');
  return { title: t('devices') };
}

/** Devices plugins find on the network, named and managed by administrators. */
export default async function DevicesPage() {
  if (!(await authorizePage(adminPermission))) return <AccessDenied />;
  const [nav, t, locale, catalog, devices] = await Promise.all([
    getTranslations('shell.nav'),
    getTranslations('devices.page'),
    getLocale(),
    loadCommands(),
    loadAllDevices(),
  ]);
  const failed = catalog.ok ? (devices.ok ? null : devices.error) : catalog.error;
  return (
    <>
      <PageHeader title={nav('devices')} />
      <main className="mx-auto grid w-full max-w-4xl grid-cols-1 gap-4 p-4 md:p-6">
        <p className="text-muted-foreground text-sm">{t('description')}</p>
        {failed === null && catalog.ok && devices.ok ? (
          <DevicesContainer
            kinds={kindViews(catalog.data.entries, (text) => localized(text, locale))}
            initial={devices.data}
          />
        ) : (
          failed && (
            <ErrorState
              code={failed.code}
              params={failed.params}
              reference={failed.code.startsWith('system.') ? failed.requestId : undefined}
            />
          )
        )}
      </main>
    </>
  );
}
