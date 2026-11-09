'use client';

import { CircleAlert, CircleCheck, CircleSlash, Loader, RotateCcw, Square, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import type { Job } from '@canopy/contracts';
import { cn } from 'cn';
import { useErrorMessage } from '@/shared/errors/use-error-message';
import { Button } from '@/shared/ui/button';
import { Progress } from '@/shared/ui/progress';
import { formatBytes } from '@/features/files/browser.utils';

import { baseName, canRetry, isActive, jobPercent, splitDuration } from '../jobs.utils';

interface JobRowProps {
  job: Job;
  onCancel: (job: Job) => void;
  onRetry: (job: Job) => void;
  onDismiss: (job: Job) => void;
}

function StateIcon({ job }: { job: Job }) {
  const className = 'size-4 shrink-0';
  if (isActive(job))
    return <Loader className={cn(className, 'text-primary animate-spin')} aria-hidden />;
  if (job.state === 'succeeded')
    return <CircleCheck className={cn(className, 'text-primary')} aria-hidden />;
  if (job.state === 'failed')
    return <CircleAlert className={cn(className, 'text-destructive')} aria-hidden />;
  return <CircleSlash className={cn(className, 'text-muted-foreground')} aria-hidden />;
}

/** One operation: what it does, live progress while running, its outcome once finished. */
export function JobRow({ job, onCancel, onRetry, onDismiss }: JobRowProps) {
  const t = useTranslations('jobs.dock');
  const locale = useLocale();
  const errorMessage = useErrorMessage();
  const percent = jobPercent(job);
  const active = isActive(job);
  const target = job.target ? baseName(job.target) : '';
  // i18n-dynamic: jobs.dock.kinds
  const kind = t.has(`kinds.${job.kind}` as Parameters<typeof t>[0])
    ? t(`kinds.${job.kind}` as Parameters<typeof t>[0])
    : t('kinds.other');

  const details: string[] = [];
  if (active) {
    if (job.state === 'queued') details.push(t('queued'));
    if (job.itemsDone > 0) details.push(t('items', { count: job.itemsDone }));
    if (job.bytesDone > 0) details.push(formatBytes(job.bytesDone, locale));
    if (job.rateBps) details.push(t('rate', { rate: formatBytes(job.rateBps, locale) }));
    if (job.etaSeconds !== undefined) {
      const { hours, minutes, seconds } = splitDuration(job.etaSeconds);
      details.push(
        hours > 0
          ? t('etaHours', { hours, minutes })
          : minutes > 0
            ? t('etaMinutes', { minutes, seconds })
            : t('etaSeconds', { seconds }),
      );
    }
  }

  return (
    <li className="grid gap-2 px-4 py-3">
      <div className="flex items-center gap-2">
        <StateIcon job={job} />
        <p className="min-w-0 flex-1 truncate text-sm" title={job.target}>
          <span className="font-medium">{kind}</span>
          {target && <span className="text-muted-foreground"> · {target}</span>}
        </p>
        {active && (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t('cancel', { name: target })}
            onClick={() => {
              onCancel(job);
            }}
          >
            <Square aria-hidden />
          </Button>
        )}
        {canRetry(job) && (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t('retry', { name: target })}
            onClick={() => {
              onRetry(job);
            }}
          >
            <RotateCcw aria-hidden />
          </Button>
        )}
        {!active && (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t('dismiss', { name: target })}
            onClick={() => {
              onDismiss(job);
            }}
          >
            <X aria-hidden />
          </Button>
        )}
      </div>
      {active &&
        (percent === null ? (
          <div
            role="progressbar"
            aria-label={t('progress', { name: target })}
            className="bg-primary/20 relative h-1.5 overflow-hidden rounded-full"
          >
            <div className="bg-primary absolute inset-y-0 w-1/3 animate-pulse rounded-full" />
          </div>
        ) : (
          <Progress
            value={percent}
            aria-label={t('progress', { name: target })}
            className="h-1.5"
          />
        ))}
      {active && details.length > 0 && (
        <p className="text-muted-foreground text-xs tabular-nums">{details.join(' · ')}</p>
      )}
      {active && job.currentPath && (
        <p className="text-muted-foreground truncate font-mono text-xs" title={job.currentPath}>
          {job.currentPath}
        </p>
      )}
      {!active && <Outcome job={job} errorMessage={errorMessage} />}
    </li>
  );
}

function Outcome({ job, errorMessage }: { job: Job; errorMessage: (code: string) => string }) {
  const t = useTranslations('jobs.dock');
  const locale = useLocale();
  if (job.state === 'failed') {
    return (
      <p className="text-destructive text-xs">{errorMessage(job.errorCode ?? 'jobs.failed')}</p>
    );
  }
  if (job.state === 'cancelled')
    return <p className="text-muted-foreground text-xs">{t('cancelled')}</p>;
  const result = job.result ?? {};
  if (job.kind === 'folder_size') {
    const bytes = Number(result.bytes ?? 0);
    const skipped = Number(result.skipped ?? 0);
    return (
      <p className="text-muted-foreground text-xs">
        {t('folderSizeResult', {
          size: formatBytes(bytes, locale),
          files: Number(result.files ?? 0),
          folders: Number(result.folders ?? 0),
        })}
        {skipped > 0 && ` · ${t('skipped', { count: skipped })}`}
      </p>
    );
  }
  if (job.kind === 'delete' || job.kind === 'trash_empty') {
    return (
      <p className="text-muted-foreground text-xs">
        {t('removedResult', { count: Number(result.items ?? 0) })}
      </p>
    );
  }
  if (job.kind === 'copy' || job.kind === 'move') {
    const notes = [
      t('transferResult', {
        items: Number(result.items ?? 0),
        size: formatBytes(Number(result.bytes ?? 0), locale),
      }),
    ];
    const skipped = Number(result.skipped ?? 0);
    const renamed = Number(result.renamed ?? 0);
    if (skipped > 0) notes.push(t('transferSkipped', { count: skipped }));
    if (renamed > 0) notes.push(t('transferRenamed', { count: renamed }));
    return <p className="text-muted-foreground text-xs">{notes.join(' · ')}</p>;
  }
  return <p className="text-muted-foreground text-xs">{t('done')}</p>;
}
