import { FolderLock, UsersRound } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { cn } from '@/shared/lib/utils';

/** Switches between a group's members and its folder access (two separate pages). */
export function GroupTabs({
  groupId,
  current,
}: {
  groupId: string;
  current: 'members' | 'access';
}) {
  const t = useTranslations('access.groups.tabs');
  const tabs = [
    { id: 'members', href: `/admin/groups/${groupId}`, label: t('members'), icon: UsersRound },
    { id: 'access', href: `/admin/groups/${groupId}/access`, label: t('access'), icon: FolderLock },
  ] as const;

  return (
    <nav aria-label={t('label')} className="bg-muted inline-flex w-fit gap-1 rounded-lg p-1">
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href as Route}
          aria-current={tab.id === current ? 'page' : undefined}
          className={cn(
            'text-muted-foreground flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            tab.id === current
              ? 'bg-background text-foreground shadow-sm'
              : 'hover:text-foreground',
          )}
        >
          <tab.icon className="size-4" aria-hidden />
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
