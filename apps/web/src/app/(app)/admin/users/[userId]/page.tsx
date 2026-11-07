import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { authorizePage } from '@/features/auth';
import { GrantsContainer, listGrants } from '@/features/files';
import { AccessDenied, PageHeader } from '@/features/shell';
import { getUserIdentity } from '@/features/users';
import { Button } from '@/shared/ui/button';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('files.grants');
  return { title: t('title') };
}

interface UserAccessPageProps {
  params: Promise<{ userId: string }>;
}

/** Folder access of one user (their own grants; group grants are on each group's page). */
export default async function UserAccessPage({ params }: UserAccessPageProps) {
  const session = await authorizePage('users:read');
  if (!session) return <AccessDenied />;
  const { userId } = await params;
  const [t, users, user, grants] = await Promise.all([
    getTranslations('files.grants'),
    getTranslations('users'),
    getUserIdentity(userId),
    listGrants({ subjectType: 'user', subjectId: userId }),
  ]);
  if (!user) notFound();

  return (
    <>
      <PageHeader title={user.name} />
      <main className="mx-auto grid w-full max-w-3xl gap-6 p-4 md:p-6">
        <div className="grid gap-2">
          <Button asChild variant="ghost" size="sm" className="w-fit">
            <Link href="/admin/users">
              <ArrowLeft aria-hidden data-icon="inline-start" />
              {users('title')}
            </Link>
          </Button>
          <p className="text-muted-foreground text-sm">
            @{user.username} · {t('pageDescription')}
          </p>
        </div>
        <GrantsContainer
          subjectType="user"
          subjectId={user.id}
          grants={grants.ok ? grants.data : []}
          canEdit={session.user.permissions.includes('users:update')}
        />
      </main>
    </>
  );
}
