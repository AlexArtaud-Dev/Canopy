import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import {
  GroupsContainer,
  isBuiltInRoleKey,
  listGroups,
  listMemberOptions,
  listRoles,
} from '@/features/access';
import { authorize } from '@/features/auth';
import { PageHeader } from '@/features/shell';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('access.groups');
  return { title: t('metaTitle') };
}

export default async function GroupsPage() {
  await authorize('groups:read');
  const [t, groups, roles, people] = await Promise.all([
    getTranslations('access'),
    listGroups(),
    listRoles(),
    listMemberOptions(),
  ]);

  return (
    <>
      <PageHeader title={t('groups.title')} />
      <main className="mx-auto grid w-full max-w-5xl gap-4 p-4 md:p-6">
        <p className="text-muted-foreground text-sm">{t('groups.description')}</p>
        <GroupsContainer
          groups={groups}
          roles={roles.map((role) => ({
            id: role.id,
            label: isBuiltInRoleKey(role.key) ? t(`builtInRoles.${role.key}`) : role.name,
          }))}
          people={people.map((person) => ({
            id: person.id,
            label: person.name,
            hint: `@${person.username}`,
          }))}
        />
      </main>
    </>
  );
}
