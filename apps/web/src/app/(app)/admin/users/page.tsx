import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { authorizePage, getConfiguredAuth, initialsOf } from '@/features/auth';
import { isBuiltInRoleKey } from '@/features/access';
import { AccessDenied, PageHeader } from '@/features/shell';
import {
  listRoleOptions,
  listUsers,
  pageCount,
  UsersContainer,
  usersQuerySchema,
} from '@/features/users';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('users');
  return { title: t('metaTitle') };
}

interface UsersPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function UsersPage({ searchParams }: UsersPageProps) {
  const session = await authorizePage('users:read');
  if (!session) return <AccessDenied />;
  const { user } = session;
  const query = usersQuerySchema.parse(await searchParams);
  const [t, roles, access, { items, total }, { policy }] = await Promise.all([
    getTranslations('users'),
    listRoleOptions(),
    getTranslations('access'),
    listUsers(query),
    getConfiguredAuth(),
  ]);
  // Built-in roles show their translated label; custom roles their own name.
  const roleLabel = (role: { key: string | null; name: string }) =>
    isBuiltInRoleKey(role.key) ? access(`builtInRoles.${role.key}`) : role.name;

  return (
    <>
      <PageHeader title={t('title')} />
      <main className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-4 p-4 md:p-6">
        <p className="text-muted-foreground text-sm">{t('description')}</p>
        <UsersContainer
          users={items.map((item) => ({
            ...item,
            initials: initialsOf(item.name),
            roles: item.roles.map((role) => ({ id: role.id, label: roleLabel(role) })),
          }))}
          roles={roles.map((role) => ({ id: role.id, label: roleLabel(role) }))}
          currentUserId={user.id}
          passwordMinLength={policy.passwordMinLength}
          query={query.q}
          page={query.page}
          pages={pageCount(total)}
          total={total}
        />
      </main>
    </>
  );
}
