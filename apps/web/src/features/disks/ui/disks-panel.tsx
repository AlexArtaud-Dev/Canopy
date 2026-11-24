'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';

import { cn } from '@/shared/lib/utils';
import { Skeleton } from '@/shared/ui/skeleton';

import { useDiskReport } from '../disks.container';
import { diskName, disksHref, needsAttention } from '../disks.utils';
import { HealthBadge, KindIcon } from './disk-look';

/** The dashboard panel: each disk with its verdict and temperature, the worrying ones first. */
export function DisksPanel() {
  const t = useTranslations('disks');
  const format = useFormatter();
  const { data, isPending, error } = useDiskReport();
  if (isPending) return <Skeleton className="size-full min-h-16" aria-label={t('panel.none')} />;
  if (error)
    return <p className="text-muted-foreground text-sm">{error.message || t('loadError')}</p>;
  if (!data.configured) {
    return <p className="text-muted-foreground text-sm">{t('notConfigured.title')}</p>;
  }
  if (data.disks.length === 0)
    return <p className="text-muted-foreground text-sm">{t('panel.none')}</p>;
  const ordered = [
    ...data.disks.filter(needsAttention),
    ...data.disks.filter((disk) => !needsAttention(disk)),
  ];
  return (
    <ul className="grid min-h-0 content-start gap-1 overflow-y-auto">
      {ordered.map((disk) => (
        <li key={disk.id}>
          <Link
            href={disksHref as Route}
            aria-label={`${diskName(disk)} · ${t('panel.open')}`}
            className="hover:bg-muted flex min-h-10 items-center gap-2 rounded-md px-2 text-sm"
          >
            <KindIcon kind={disk.kind} className="text-muted-foreground size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{diskName(disk)}</span>
            {disk.temperature !== undefined && (
              <span
                className={cn(
                  'shrink-0 text-xs tabular-nums',
                  disk.hot ? 'text-destructive font-medium' : 'text-muted-foreground',
                )}
              >
                {format.number(disk.temperature, { style: 'unit', unit: 'celsius' })}
              </span>
            )}
            <HealthBadge health={disk.health} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
