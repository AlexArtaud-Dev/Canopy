import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';

import { appRegistry } from '@/modules';
import {
  isBuiltInRoleKey,
  listRoles,
  permissionMatrix,
  RolesContainer,
  type PermissionRow,
} from '@/features/access';
import { localized } from '@/features/commands/commands.utils';
import { installedViewGrants } from '@/features/plugin-views/server/view-permissions';
import { authorizePage } from '@/features/auth';
import { AccessDenied, PageHeader } from '@/features/shell';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('access.roles');
  return { title: t('metaTitle') };
}

export default async function RolesPage() {
  if (!(await authorizePage('roles:read'))) return <AccessDenied />;
  const [t, roles, grants, locale, pluginT] = await Promise.all([
    getTranslations('access'),
    listRoles(),
    installedViewGrants(),
    getLocale(),
    getTranslations('pluginViews'),
  ]);
  const matrix = permissionMatrix(appRegistry.globalPermissions);
  // Plugin pages (Downloads…) are granted like any right, under their plugin's names.
  const pluginRow: PermissionRow | null =
    grants.length === 0
      ? null
      : {
          module: 'pluginViews',
          label: pluginT('permissions'),
          actions: grants.map(({ ref, permission }) => ({
            action: ref.view.id,
            permission,
            label: `${localized(ref.view.name, locale)} (${localized(ref.pluginName, locale)})`,
          })),
        };

  return (
    <>
      <PageHeader title={t('roles.title')} />
      <main className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-4 p-4 md:p-6">
        <p className="text-muted-foreground text-sm">{t('roles.description')}</p>
        <RolesContainer
          matrix={pluginRow ? [...matrix, pluginRow] : matrix}
          roles={roles.map((role) => ({
            ...role,
            builtIn: role.key !== null,
            label: isBuiltInRoleKey(role.key) ? t(`builtInRoles.${role.key}`) : role.name,
            // Built-in roles are described in the person's language, not as seeded.
            description: isBuiltInRoleKey(role.key)
              ? t(`builtInRoleDescriptions.${role.key}`)
              : role.description,
          }))}
        />
      </main>
    </>
  );
}
