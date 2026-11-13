import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { authorizePage } from '@/features/auth';
import { getMailAdminView, listRecentMail, MailContainer } from '@/features/mail';
import { AccessDenied, PageHeader } from '@/features/shell';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('mail');
  return { title: t('metaTitle') };
}

export default async function EmailPage() {
  if (!(await authorizePage('mail:read'))) return <AccessDenied />;
  const [t, view, outbox] = await Promise.all([
    getTranslations('mail'),
    getMailAdminView(),
    listRecentMail(),
  ]);

  return (
    <>
      <PageHeader title={t('title')} />
      <main className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-4 p-4 md:p-6">
        <p className="text-muted-foreground text-sm">{t('description')}</p>
        <MailContainer {...view} outbox={outbox} />
      </main>
    </>
  );
}
