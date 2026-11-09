import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { listMemberOptions } from '@/features/access';
import { permissionsOf, requireSession } from '@/features/auth';
import { PageHeader } from '@/features/shell';
import { loadShares, SharesContainer } from '@/features/shares';
import { ErrorState } from '@/shared/errors/error-state';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('shell.nav');
  return { title: t('shares') };
}

/** The person's share links; managers can switch to everyone's. */
export default async function SharesPage() {
  const [{ user }, nav, t, shares] = await Promise.all([
    requireSession(),
    getTranslations('shell.nav'),
    getTranslations('shares.page'),
    loadShares({ all: false }),
  ]);
  const canManage = permissionsOf(user).includes('shares:manage');
  const ownerNames = canManage
    ? Object.fromEntries((await listMemberOptions()).map((member) => [member.id, member.username]))
    : {};
  return (
    <>
      <PageHeader title={nav('shares')} />
      <main className="mx-auto grid w-full max-w-6xl gap-4 p-4 md:p-6">
        <p className="text-muted-foreground text-sm">{t('description')}</p>
        {shares.ok ? (
          <SharesContainer initial={shares.data} canManage={canManage} ownerNames={ownerNames} />
        ) : (
          <ErrorState
            code={shares.error.code}
            params={shares.error.params}
            reference={shares.error.code.startsWith('system.') ? shares.error.requestId : undefined}
          />
        )}
      </main>
    </>
  );
}
