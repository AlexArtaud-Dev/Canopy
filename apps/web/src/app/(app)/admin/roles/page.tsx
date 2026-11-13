import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { appRegistry } from '@/modules';
import { isBuiltInRoleKey, listRoles, permissionMatrix, RolesContainer } from '@/features/access';
import { authorizePage } from '@/features/auth';
import { AccessDenied, PageHeader } from '@/features/shell';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('access.roles');
  return { title: t('metaTitle') };
}

export default async function RolesPage() {
  if (!(await authorizePage('roles:read'))) return <AccessDenied />;
  const [t, roles] = await Promise.all([getTranslations('access'), listRoles()]);

  return (
    <>
      <PageHeader title={t('roles.title')} />
      <main className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-4 p-4 md:p-6">
        <p className="text-muted-foreground text-sm">{t('roles.description')}</p>
        <RolesContainer
          matrix={permissionMatrix(appRegistry.globalPermissions)}
          roles={roles.map((role) => ({
            ...role,
            builtIn: role.key !== null,
            label: isBuiltInRoleKey(role.key) ? t(`builtInRoles.${role.key}`) : role.name,
          }))}
        />
      </main>
    </>
  );
}
