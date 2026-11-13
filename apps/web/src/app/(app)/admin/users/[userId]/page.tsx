import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import {
  AccessCheckContainer,
  getUserAccessOverview,
  InheritedGrantsCard,
  PermissionsCard,
} from '@/features/access';
import { authorizePage } from '@/features/auth';
import { GrantsContainer, listGrants } from '@/features/files';
import { AccessDenied, PageHeader } from '@/features/shell';
import { getUserIdentity } from '@/features/users';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('access.userAccess');
  return { title: t('title') };
}

interface UserAccessPageProps {
  params: Promise<{ userId: string }>;
}

/**
 * Everything a user can do and why: permissions with their roles and groups, their own folder
 * rules (editable), rules inherited from groups, and a per-folder check resolved by the engine.
 */
export default async function UserAccessPage({ params }: UserAccessPageProps) {
  const session = await authorizePage('users:read');
  if (!session) return <AccessDenied />;
  const { userId } = await params;
  const [t, users, access, user, grants] = await Promise.all([
    getTranslations('access.userAccess'),
    getTranslations('users'),
    getTranslations('access'),
    getUserIdentity(userId),
    listGrants({ subjectType: 'user', subjectId: userId }),
  ]);
  if (!user) notFound();
  const overview = await getUserAccessOverview(userId, (key) => access(`builtInRoles.${key}`));

  return (
    <>
      <PageHeader title={user.name} />
      <main className="mx-auto grid w-full max-w-4xl grid-cols-1 gap-6 p-4 md:p-6">
        <div className="grid gap-2">
          <Button asChild variant="ghost" size="sm" className="w-fit">
            <Link href="/admin/users">
              <ArrowLeft aria-hidden data-icon="inline-start" />
              {users('title')}
            </Link>
          </Button>
          <p className="text-muted-foreground text-sm">
            @{user.username} · {t('description')}
          </p>
          <div className="flex flex-wrap items-center gap-1">
            {overview.isAdmin && <Badge>{t('administrator')}</Badge>}
            {overview.groups.length === 0 ? (
              <span className="text-muted-foreground text-xs">{t('noGroups')}</span>
            ) : (
              overview.groups.map((group) => (
                <Badge key={group.id} variant="outline">
                  {group.name}
                </Badge>
              ))
            )}
          </div>
        </div>
        <PermissionsCard permissions={overview.permissions} />
        <GrantsContainer
          subjectType="user"
          subjectId={user.id}
          grants={grants.ok ? grants.data : []}
          canEdit={session.user.permissions.includes('users:update')}
        />
        <InheritedGrantsCard grants={overview.inheritedGrants} />
        <AccessCheckContainer
          userId={user.id}
          groupNames={Object.fromEntries(overview.groups.map((group) => [group.id, group.name]))}
        />
      </main>
    </>
  );
}
