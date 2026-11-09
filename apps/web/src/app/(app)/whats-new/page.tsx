import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { requireSession } from '@/features/auth';
import { PageHeader } from '@/features/shell';
import { WhatsNewContainer } from '@/features/whats-new';
import { loadWhatsNew } from '@/features/whats-new/server/changelog';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('whatsNew');
  return { title: t('title') };
}

/** The changelog of this build, for everyone signed in. */
export default async function WhatsNewPage() {
  const [, t, whatsNew] = await Promise.all([
    requireSession(),
    getTranslations('whatsNew'),
    loadWhatsNew(),
  ]);
  return (
    <>
      <PageHeader title={t('title')} />
      <main className="mx-auto grid w-full max-w-3xl gap-4 p-4 md:p-6">
        <WhatsNewContainer {...whatsNew} />
      </main>
    </>
  );
}
