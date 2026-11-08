'use client';

import { ChevronDown, ListChecks } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import type { Job, JobState } from '@canopy/contracts';
import { cn } from 'cn';
import { useErrorMessage } from '@/shared/errors/use-error-message';
import { Button } from '@/shared/ui/button';

import { baseName, dockJobs, dockSummary } from './jobs.utils';
import { useJobs } from './model/use-jobs';
import { cancelJob, startFolderSize } from './server/jobs-actions';
import { JobRow } from './ui/job-row';

const dismissedKey = 'canopy.jobs.dismissed';
const clockIntervalMs = 60_000;

function readDismissed(): Set<string> {
  try {
    const raw = window.localStorage.getItem(dismissedKey);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []);
  } catch {
    // Private mode or blocked storage: start empty.
    return new Set();
  }
}

function saveDismissed(ids: ReadonlySet<string>): void {
  try {
    // Only recent jobs are ever shown, so a short list is enough to remember.
    window.localStorage.setItem(dismissedKey, JSON.stringify([...ids].slice(-100)));
  } catch {
    // Not remembered across visits.
  }
}

/** Persistent panel of running and recent operations, on every page of the app. */
export function JobsDockContainer() {
  const t = useTranslations('jobs.dock');
  const errorMessage = useErrorMessage();
  const [expanded, setExpanded] = useState(true);
  // The dock renders nothing until jobs load on the client, so reading storage here is safe.
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() =>
    typeof window === 'undefined' ? new Set() : readDismissed(),
  );
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, clockIntervalMs);
    return () => {
      clearInterval(timer);
    };
  }, []);

  const onFinished = useCallback(
    (job: Job, state: JobState) => {
      setNow(new Date());
      const name = job.target ? baseName(job.target) : '';
      if (state === 'succeeded') toast.success(t('finished', { name }));
      else if (state === 'failed') toast.error(t('failed', { name }));
    },
    [t],
  );
  const jobs = useJobs(onFinished);
  const visible = useMemo(() => dockJobs(jobs, dismissed, now), [jobs, dismissed, now]);
  const summary = dockSummary(visible);

  if (visible.length === 0) return null;

  const dismiss = (ids: readonly string[]) => {
    setDismissed((current) => {
      const next = new Set([...current, ...ids]);
      saveDismissed(next);
      return next;
    });
  };
  const report = (result: { ok: boolean; error?: { code: string } }) => {
    if (!result.ok && result.error) toast.error(errorMessage(result.error.code));
  };

  return (
    <aside
      aria-label={t('title')}
      className="bg-popover text-popover-foreground fixed inset-x-2 bottom-2 z-40 overflow-hidden rounded-xl border shadow-lg sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-96"
    >
      <div className="flex items-center gap-2 border-b px-4 py-2.5">
        <ListChecks className="text-muted-foreground size-4" aria-hidden />
        <h2 className="text-sm font-medium">{t('title')}</h2>
        <p className="text-muted-foreground min-w-0 flex-1 truncate text-xs" aria-live="polite">
          {[
            summary.active > 0 && t('active', { count: summary.active }),
            summary.failed > 0 && t('failedCount', { count: summary.failed }),
            summary.done > 0 && t('doneCount', { count: summary.done }),
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {summary.active === 0 && (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => {
              dismiss(visible.map((job) => job.id));
            }}
          >
            {t('clear')}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-xs"
          aria-expanded={expanded}
          aria-label={expanded ? t('collapse') : t('expand')}
          onClick={() => {
            setExpanded((value) => !value);
          }}
        >
          <ChevronDown
            className={cn('transition-transform', !expanded && 'rotate-180')}
            aria-hidden
          />
        </Button>
      </div>
      {expanded && (
        <ul className="max-h-80 divide-y overflow-y-auto">
          {visible.map((job) => (
            <JobRow
              key={job.id}
              job={job}
              onCancel={(target) => {
                void cancelJob({ jobId: target.id }).then(report);
              }}
              onRetry={(target) => {
                if (target.target) void startFolderSize({ path: target.target }).then(report);
                dismiss([target.id]);
              }}
              onDismiss={(target) => {
                dismiss([target.id]);
              }}
            />
          ))}
        </ul>
      )}
    </aside>
  );
}
