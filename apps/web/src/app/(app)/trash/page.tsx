import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { listMemberOptions } from '@/features/access';
import { requireSession } from '@/features/auth';
import { PageHeader } from '@/features/shell';
import { loadTrash, TrashContainer } from '@/features/trash';
import { ErrorState } from '@/shared/errors/error-state';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('shell.nav');
  return { title: t('trash') };
}

/** Deleted items, kept per volume within the trash limits. */
export default async function TrashPage() {
  const [{ user }, nav, t, listing] = await Promise.all([
    requireSession(),
    getTranslations('shell.nav'),
    getTranslations('trash.page'),
    loadTrash(),
  ]);
  // Administrators see everyone's deletions: show who, by username rather than account id.
  const ownerNames = user.isAdmin
    ? Object.fromEntries((await listMemberOptions()).map((member) => [member.id, member.username]))
    : {};
  return (
    <>
      <PageHeader title={nav('trash')} />
      <main className="mx-auto grid w-full max-w-6xl gap-4 p-4 md:p-6">
        <p className="text-muted-foreground text-sm">{t('description')}</p>
        {listing.ok ? (
          <TrashContainer initial={listing.data} showOwner={user.isAdmin} ownerNames={ownerNames} />
        ) : (
          <ErrorState
            code={listing.error.code}
            params={listing.error.params}
            reference={
              listing.error.code.startsWith('system.') ? listing.error.requestId : undefined
            }
          />
        )}
      </main>
    </>
  );
}
