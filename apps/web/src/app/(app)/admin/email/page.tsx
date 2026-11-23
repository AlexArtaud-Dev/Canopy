import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { authorizePage } from '@/features/auth';
import { getMailAdminView, listOutbox, MailContainer } from '@/features/mail';
import { outboxQuerySchema } from '@/features/mail/mail.utils';
import { getSettings } from '@/features/settings/server/settings-store';
import { systemSettings } from '@/features/system/system.settings';
import { AccessDenied, PageHeader } from '@/features/shell';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('mail');
  return { title: t('metaTitle') };
}

export default async function EmailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!(await authorizePage('mail:read'))) return <AccessDenied />;
  const query = outboxQuerySchema.parse(await searchParams);
  const [t, view, outbox, system] = await Promise.all([
    getTranslations('mail'),
    getMailAdminView(),
    listOutbox(query),
    getSettings('system', systemSettings),
  ]);

  return (
    <>
      <PageHeader title={t('title')} />
      <main className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-4 p-4 md:p-6">
        <p className="text-muted-foreground text-sm">{t('description')}</p>
        <MailContainer
          {...view}
          outbox={{ ...outbox, query }}
          retentionDays={system.values.mailRetentionDays}
        />
      </main>
    </>
  );
}
