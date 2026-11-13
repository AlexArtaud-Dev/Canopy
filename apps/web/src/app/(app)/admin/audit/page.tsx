import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { appRegistry } from '@/modules';
import {
  AuditContainer,
  auditFiltersSchema,
  auditPageSize,
  listAuditEvents,
} from '@/features/audit';
import { authorizePage } from '@/features/auth';
import { AccessDenied, PageHeader } from '@/features/shell';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('audit');
  return { title: t('metaTitle') };
}

interface AuditPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AuditPage({ searchParams }: AuditPageProps) {
  if (!(await authorizePage('audit:read'))) return <AccessDenied />;
  const filters = auditFiltersSchema.parse(await searchParams);
  const [t, { rows, total }] = await Promise.all([
    getTranslations('audit'),
    listAuditEvents(filters),
  ]);

  return (
    <>
      <PageHeader title={t('title')} />
      <main className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-4 p-4 md:p-6">
        <p className="text-muted-foreground text-sm">{t('description')}</p>
        <AuditContainer
          rows={rows}
          total={total}
          pages={Math.max(1, Math.ceil(total / auditPageSize))}
          filters={filters}
          actions={[...appRegistry.auditActions].sort()}
        />
      </main>
    </>
  );
}
