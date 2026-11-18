import { redirect } from 'next/navigation';

import { loadDashboards } from '@/features/dashboards/server/dashboards-actions';
import { PageHeader } from '@/features/shell';
import { ErrorState } from '@/shared/errors/error-state';

/** Opens the person's home dashboard (made on the first visit). */
export default async function DashboardsPage() {
  const dashboards = await loadDashboards();
  if (!dashboards.ok) {
    return (
      <>
        <PageHeader title="" />
        <main className="p-4 md:p-6">
          <ErrorState code={dashboards.error.code} reference={dashboards.error.requestId} />
        </main>
      </>
    );
  }
  const home = dashboards.data.find((dashboard) => dashboard.isHome) ?? dashboards.data[0];
  redirect(home ? `/dashboards/${home.id}` : '/');
}
