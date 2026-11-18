import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { DashboardContainer } from '@/features/dashboards';
import { loadDashboards } from '@/features/dashboards/server/dashboards-actions';
import { loadVariables } from '@/features/dashboards/server/variables-actions';
import { PageHeader } from '@/features/shell';
import { ErrorState } from '@/shared/errors/error-state';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('shell.nav');
  return { title: t('dashboards') };
}

/** One of the person's dashboards. Another person's id finds nothing: each sees only their own. */
export default async function DashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, nav, dashboards, variables] = await Promise.all([
    params,
    getTranslations('shell.nav'),
    loadDashboards(),
    loadVariables(),
  ]);
  const current = dashboards.ok ? dashboards.data.find((dashboard) => dashboard.id === id) : null;
  if (dashboards.ok && !current) notFound();
  return (
    <>
      <PageHeader title={current?.name ?? nav('dashboards')} />
      <main className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-4 p-4 md:p-6">
        {dashboards.ok && current ? (
          <DashboardContainer
            key={current.id}
            dashboards={dashboards.data}
            current={current}
            variables={variables.ok ? variables.data : []}
          />
        ) : (
          !dashboards.ok && (
            <ErrorState code={dashboards.error.code} reference={dashboards.error.requestId} />
          )
        )}
      </main>
    </>
  );
}
