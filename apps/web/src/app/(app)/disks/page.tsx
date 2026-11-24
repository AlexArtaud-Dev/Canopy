import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { authorizePage } from '@/features/auth';
import { DisksContainer, diskReadPermission } from '@/features/disks';
import { AccessDenied, PageHeader } from '@/features/shell';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('shell.nav');
  return { title: t('disks') };
}

export default async function DisksPage() {
  const session = await authorizePage(diskReadPermission);
  if (!session) return <AccessDenied />;
  const [nav, t] = await Promise.all([getTranslations('shell.nav'), getTranslations('disks')]);

  return (
    <>
      <PageHeader title={nav('disks')} />
      <main className="mx-auto grid w-full max-w-6xl flex-1 content-start gap-4 p-4 md:p-6">
        <p className="text-muted-foreground max-w-3xl text-sm text-pretty">{t('description')}</p>
        <DisksContainer canManage={session.user.isAdmin} />
      </main>
    </>
  );
}
