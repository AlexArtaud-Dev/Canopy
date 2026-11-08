import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';

import { getGroup, GroupTabs } from '@/features/access';
import { authorizePage } from '@/features/auth';
import { GrantsContainer, listGrants } from '@/features/files';
import { AccessDenied, PageHeader } from '@/features/shell';
import { Button } from '@/shared/ui/button';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('files.grants');
  return { title: t('title') };
}

interface GroupAccessPageProps {
  params: Promise<{ groupId: string }>;
}

/** Folder access rules of one group (members are managed on the group's main page). */
export default async function GroupAccessPage({ params }: GroupAccessPageProps) {
  const session = await authorizePage('groups:read');
  if (!session) return <AccessDenied />;
  const parsed = z.uuid().safeParse((await params).groupId);
  if (!parsed.success) notFound();
  const [t, group, grants] = await Promise.all([
    getTranslations('access.groups.membersPage'),
    getGroup(parsed.data),
    listGrants({ subjectType: 'group', subjectId: parsed.data }),
  ]);
  if (!group) notFound();

  return (
    <>
      <PageHeader title={group.name} />
      <main className="mx-auto grid w-full max-w-3xl gap-6 p-4 md:p-6">
        <Button asChild variant="ghost" size="sm" className="w-fit">
          <Link href="/admin/groups">
            <ArrowLeft aria-hidden data-icon="inline-start" />
            {t('back')}
          </Link>
        </Button>
        <GroupTabs groupId={group.id} current="access" />
        <GrantsContainer
          subjectType="group"
          subjectId={group.id}
          grants={grants.ok ? grants.data : []}
          canEdit={session.user.permissions.includes('groups:update')}
        />
      </main>
    </>
  );
}
