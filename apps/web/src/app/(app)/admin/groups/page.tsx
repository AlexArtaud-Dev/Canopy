import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { GroupsContainer, isBuiltInRoleKey, listGroups, listRoles } from '@/features/access';
import { authorizePage } from '@/features/auth';
import { AccessDenied, PageHeader } from '@/features/shell';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('access.groups');
  return { title: t('metaTitle') };
}

export default async function GroupsPage() {
  if (!(await authorizePage('groups:read'))) return <AccessDenied />;
  const [t, groups, roles] = await Promise.all([
    getTranslations('access'),
    listGroups(),
    listRoles(),
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
        />
      </main>
    </>
  );
}
