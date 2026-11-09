import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { authorizePage } from '@/features/auth';
import { getSettingsView, SettingsContainer } from '@/features/settings';
import { AccessDenied, PageHeader } from '@/features/shell';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings');
  return { title: t('metaTitle') };
}

export default async function SettingsPage() {
  if (!(await authorizePage('settings:read'))) return <AccessDenied />;
  const [t, view] = await Promise.all([getTranslations('settings'), getSettingsView()]);

  return (
    <>
      <PageHeader title={t('title')} />
      <main className="mx-auto grid w-full max-w-5xl gap-4 p-4 md:p-6">
        <p className="text-muted-foreground text-sm">{t('description')}</p>
        <SettingsContainer modules={view.modules} local={view.local} />
      </main>
    </>
  );
}
