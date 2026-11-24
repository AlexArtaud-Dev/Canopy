'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { HardDrive, RefreshCw } from 'lucide-react';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import type { DiskReport } from '@canopy/contracts';
import { useErrorMessage } from '@/shared/errors/use-error-message';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/shared/ui/empty';
import { Skeleton } from '@/shared/ui/skeleton';

import { diskSummary, needsAttention } from './disks.utils';
import { checkDisksNow, readDisks, runDiskSelfTest } from './server/disks-actions';
import { DiskCard } from './ui/disk-card';

export const disksQueryKey = ['disks'] as const;

/** The reading changes every few minutes at most: a minute is fresh enough. */
const refetchMs = 60_000;

/** The latest disk reading, shared by the page and the dashboard panel. */
export function useDiskReport() {
  const errorMessage = useErrorMessage();
  return useQuery({
    queryKey: disksQueryKey,
    queryFn: async (): Promise<DiskReport> => {
      const result = await readDisks();
      if (!result.ok) throw new Error(errorMessage(result.error.code, result.error.params));
      return result.data;
    },
    refetchInterval: refetchMs,
  });
}

/** The disks page: a summary, "check now" for administrators, then one card per disk. */
export function DisksContainer({ canManage }: { canManage: boolean }) {
  const t = useTranslations('disks');
  const format = useFormatter();
  const now = useNow({ updateInterval: refetchMs });
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const { data, isPending, error } = useDiskReport();
  const [checking, startChecking] = useTransition();
  const [starting, setStarting] = useState<{ disk: string; test: 'short' | 'long' } | null>(null);

  const checkNow = () => {
    startChecking(async () => {
      const result = await checkDisksNow();
      if (!result.ok) {
        toast.error(errorMessage(result.error.code, result.error.params));
        return;
      }
      queryClient.setQueryData(disksQueryKey, result.data);
      toast.success(t('checkDone'));
    });
  };

  const selfTest = async (disk: string, test: 'short' | 'long') => {
    setStarting({ disk, test });
    const result = await runDiskSelfTest({ disk, test });
    setStarting(null);
    if (!result.ok) {
      toast.error(errorMessage(result.error.code, result.error.params));
      return;
    }
    toast.success(t('selfTest.started'));
    await queryClient.invalidateQueries({ queryKey: disksQueryKey });
  };

  if (isPending) {
    return (
      <div className="grid gap-4" aria-busy>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error.message || t('loadError')}</AlertDescription>
      </Alert>
    );
  }
  if (!data.configured) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HardDrive aria-hidden />
          </EmptyMedia>
          <EmptyTitle>{t('notConfigured.title')}</EmptyTitle>
          <EmptyDescription>{t('notConfigured.description')}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const summary = diskSummary(data.disks);
  const parts = [
    summary.failing > 0 && t('summaryFailing', { count: summary.failing }),
    summary.warning > 0 && t('summaryWarning', { count: summary.warning }),
    summary.hot > 0 && t('summaryHot', { count: summary.hot }),
  ].filter((part): part is string => typeof part === 'string');
  // "All healthy" only when some disk vouches for it: disks without SMART data say nothing.
  const verdict =
    parts.length > 0
      ? parts.join(' · ')
      : data.disks.some((disk) => disk.health === 'passed')
        ? t('allHealthy')
        : t('health.unknown');
  // Disks that need a look come first; the others keep the order they were found in.
  const ordered = [
    ...data.disks.filter(needsAttention),
    ...data.disks.filter((disk) => !needsAttention(disk)),
  ];

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {t('summary', { total: summary.total })}
            {' · '}
            <span className={parts.length > 0 ? 'text-destructive' : 'text-muted-foreground'}>
              {verdict}
            </span>
          </p>
          <p className="text-muted-foreground text-xs">
            {data.checkedAt
              ? t('checked', {
                  when: format.relativeTime(
                    // The page's clock ticks slowly: a fresh check is never "in the future".
                    new Date(Math.min(Date.parse(data.checkedAt), now.getTime())),
                    now,
                  ),
                })
              : t('checkedNever')}
          </p>
        </div>
        {canManage && (
          <Button variant="outline" size="sm" onClick={checkNow} disabled={checking}>
            <RefreshCw aria-hidden className={checking ? 'animate-spin' : undefined} />
            {t('checkNow')}
          </Button>
        )}
      </div>

      {ordered.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HardDrive aria-hidden />
            </EmptyMedia>
            <EmptyTitle>{t('empty.title')}</EmptyTitle>
            <EmptyDescription>{t('empty.description')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {ordered.map((disk) => (
            <DiskCard
              key={disk.id}
              disk={disk}
              canManage={canManage}
              starting={starting?.disk === disk.id ? starting.test : null}
              onSelfTest={(test) => void selfTest(disk.id, test)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
