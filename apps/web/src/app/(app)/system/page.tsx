import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { authorize } from '@/features/auth';
import { PageHeader } from '@/features/shell';
import { getSystemStatus, SystemStatusCard } from '@/features/system';

// Status must reflect the moment of the request, never a build-time snapshot.
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('shell.nav');
  return { title: t('system') };
}

export default async function SystemPage() {
  await authorize('system:read');
  const [nav, status] = await Promise.all([getTranslations('shell.nav'), getSystemStatus()]);

  return (
    <>
      <PageHeader title={nav('system')} />
      <main className="mx-auto w-full max-w-3xl flex-1 p-4 md:p-6">
        <SystemStatusCard status={status} />
      </main>
    </>
  );
}
