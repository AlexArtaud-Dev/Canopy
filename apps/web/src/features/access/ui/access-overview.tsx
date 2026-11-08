import { KeyRound, UsersRound } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { Badge } from '@/shared/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';

import type { PermissionTrace } from '../access.utils';
import type { InheritedGrant } from '../server/user-access';

/** Global permissions of a user, each with the roles (and groups) granting it. */
export function PermissionsCard({ permissions }: { permissions: readonly PermissionTrace[] }) {
  const t = useTranslations('access.userAccess');
  const labels = useTranslations('access');
  // i18n-dynamic: access.modules
  // i18n-dynamic: access.actions
  const label = (key: string) => labels(key as Parameters<typeof labels>[0]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="text-muted-foreground size-4" aria-hidden />
          {t('permissionsTitle')}
        </CardTitle>
        <CardDescription>{t('permissionsDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        {permissions.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('noPermissions')}</p>
        ) : (
          <ul className="divide-y">
            {permissions.map((trace) => {
              const [module = '', action = ''] = trace.permission.split(':');
              return (
                <li
                  key={trace.permission}
                  className="flex flex-col gap-1.5 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center"
                >
                  <span className="text-sm font-medium sm:w-56">
                    {label(`modules.${module}`)} · {label(`actions.${action}`)}
                  </span>
                  <span className="flex flex-wrap gap-1">
                    {trace.sources.map((source) => (
                      <Badge
                        key={`${source.roleName}:${source.groupName ?? ''}`}
                        variant={source.groupName ? 'outline' : 'secondary'}
                      >
                        {source.groupName
                          ? t('viaGroup', { role: source.roleName, group: source.groupName })
                          : t('direct', { role: source.roleName })}
                      </Badge>
                    ))}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** Folder rules a user gets from their groups (edited on each group's access page). */
export function InheritedGrantsCard({ grants }: { grants: readonly InheritedGrant[] }) {
  const t = useTranslations('access.userAccess');
  const grantsT = useTranslations('files.grants');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UsersRound className="text-muted-foreground size-4" aria-hidden />
          {t('inheritedTitle')}
        </CardTitle>
        <CardDescription>{t('inheritedDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        {grants.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('noInherited')}</p>
        ) : (
          <ul className="divide-y">
            {grants.map((grant) => (
              <li key={grant.id} className="grid gap-1.5 py-3 first:pt-0 last:pb-0">
                <p className="flex flex-wrap items-center gap-2">
                  <code className="bg-muted rounded px-1.5 py-0.5 text-xs">{grant.path}</code>
                  <Badge variant={grant.effect === 'deny' ? 'destructive' : 'default'}>
                    {grantsT(`effects.${grant.effect}`)}
                  </Badge>
                  <Link
                    href={`/admin/groups/${grant.groupId}/access` as Route}
                    className="text-muted-foreground text-xs underline-offset-4 hover:underline"
                  >
                    {t('fromGroup', { group: grant.groupName })}
                  </Link>
                </p>
                <div className="flex flex-wrap gap-1">
                  {grant.actions.map((action) => (
                    <Badge key={action} variant="secondary">
                      {/* i18n-dynamic: files.grants.actionNames */}
                      {grantsT(`actionNames.${action}` as Parameters<typeof grantsT>[0])}
                    </Badge>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
