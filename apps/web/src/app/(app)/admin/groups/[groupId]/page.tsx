import { ArrowLeft, ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';

import {
  getGroup,
  GroupMembersContainer,
  isBuiltInRoleKey,
  listMemberOptions,
  listRoles,
} from '@/features/access';
import { authorizePage, initialsOf } from '@/features/auth';
import { AccessDenied, PageHeader } from '@/features/shell';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('access.groups');
  return { title: t('metaTitle') };
}

interface GroupPageProps {
  params: Promise<{ groupId: string }>;
}

export default async function GroupPage({ params }: GroupPageProps) {
  if (!(await authorizePage('groups:read'))) return <AccessDenied />;
  const parsed = z.uuid().safeParse((await params).groupId);
  if (!parsed.success) notFound();
  const [t, group, roles, people] = await Promise.all([
    getTranslations('access'),
    getGroup(parsed.data),
    listRoles(),
    listMemberOptions(),
  ]);
  if (!group) notFound();

  const memberIds = new Set(group.members.map((member) => member.id));
  const toPerson = (person: { id: string; username: string; name: string }) => ({
    ...person,
    initials: initialsOf(person.name),
  });
  const roleLabels = new Map(
    roles.map((role) => [
      role.id,
      isBuiltInRoleKey(role.key) ? t(`builtInRoles.${role.key}`) : role.name,
    ]),
  );

  return (
    <>
      <PageHeader title={group.name} />
      <main className="mx-auto grid w-full max-w-3xl gap-6 p-4 md:p-6">
        <div className="grid gap-3">
          <Button asChild variant="ghost" size="sm" className="w-fit">
            <Link href="/admin/groups">
              <ArrowLeft aria-hidden data-icon="inline-start" />
              {t('groups.membersPage.back')}
            </Link>
          </Button>
          {group.description && (
            <p className="text-muted-foreground text-sm">{group.description}</p>
          )}
          <div className="flex flex-wrap gap-1">
            {group.requireTwoFactor && (
              <Badge variant="outline" className="gap-1">
                <ShieldCheck aria-hidden />
                {t('groups.requireTwoFactor')}
              </Badge>
            )}
            {group.roleIds.map((roleId) => (
              <Badge key={roleId} variant="secondary">
                {roleLabels.get(roleId) ?? roleId}
              </Badge>
            ))}
          </div>
        </div>
        <GroupMembersContainer
          groupId={group.id}
          members={group.members.map(toPerson)}
          candidates={people.filter((person) => !memberIds.has(person.id)).map(toPerson)}
        />
      </main>
    </>
  );
}
