'use client';

import { ChevronDown, ListChecks } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import type { Job, JobState } from '@canopy/contracts';
import { cn } from 'cn';
import { useErrorMessage } from '@/shared/errors/use-error-message';
import { filesystemQueryRoot } from '@/shared/query/query-keys';
import { Button } from '@/shared/ui/button';
import {
  cancelUpload,
  dismissUploads,
  isUploadActive,
  onUploadFinished,
  retryUpload,
  UploadRow,
  uploading,
  useUploads,
} from '@/features/uploads';

import { useRunLabels } from '@/features/commands/model/use-run-labels';

import { baseName, dockJobs, dockSummary, isQuietRun } from './jobs.utils';
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
  // Folded on a phone, where the open panel would cover most of the page; its header still
  // tells what runs. The dock renders only once jobs load on the client, so `window` exists.
  const [expanded, setExpanded] = useState(
    () => typeof window === 'undefined' || !window.matchMedia('(max-width: 639px)').matches,
  );
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

  const labels = useRunLabels();
  const runName = useCallback(
    (job: Pick<Job, 'kind' | 'target'>) =>
      job.kind === 'command' && job.target !== undefined ? labels.names.get(job.target) : undefined,
    [labels],
  );
  // Read when a run ends, without re-subscribing to the jobs stream.
  const latest = useRef({ expanded, labels, runName });
  useEffect(() => {
    latest.current = { expanded, labels, runName };
  });

  // A failure always gets a toast; a success only when the panel is folded (it shows it
  // otherwise), and never for runs done on the person's behalf.
  const onFinished = useCallback(
    (job: Job, state: JobState) => {
      setNow(new Date());
      const { expanded: open, labels: known, runName: named } = latest.current;
      const name = named(job) ?? (job.target ? baseName(job.target) : '');
      if (state === 'failed') toast.error(t('failed', { name }));
      else if (state === 'succeeded' && !open && !isQuietRun({ ...job, state }, known.quiet)) {
        toast.success(t('finished', { name }));
      }
    },
    [t],
  );
  const jobs = useJobs(onFinished);
  const visible = useMemo(
    () => dockJobs(jobs, dismissed, now, labels.quiet),
    [jobs, dismissed, now, labels.quiet],
  );
  const summary = dockSummary(visible);
  const uploads = useUploads();
  const queryClient = useQueryClient();
  const uploadsActive = uploads.filter(isUploadActive).length;
  const uploadsFailed = uploads.filter((item) => item.state === 'failed').length;

  // Uploads report speed: tick every second while any is sending.
  useEffect(() => {
    if (uploadsActive === 0) return;
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [uploadsActive]);

  // Each finished file shows up in open folders; failures also get a toast.
  useEffect(() => {
    onUploadFinished((item) => {
      void queryClient.invalidateQueries({ queryKey: [filesystemQueryRoot] });
      if (item.state === 'failed') toast.error(t('uploadFailed', { name: item.name }));
    });
  }, [queryClient, t]);

  // Leaving the page would stop the uploads: the browser asks first.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (uploading()) event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
    };
  }, []);

  if (visible.length === 0 && uploads.length === 0) return null;
  const allActive = summary.active + uploadsActive;

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
            allActive > 0 && t('active', { count: allActive }),
            summary.failed + uploadsFailed > 0 &&
              t('failedCount', { count: summary.failed + uploadsFailed }),
            summary.done > 0 && t('doneCount', { count: summary.done }),
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {allActive === 0 && (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => {
              dismiss(visible.map((job) => job.id));
              dismissUploads(new Set(uploads.map((item) => item.id)));
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
          {uploads.map((item) => (
            <UploadRow
              key={item.id}
              item={item}
              now={now.getTime()}
              onCancel={cancelUpload}
              onRetry={retryUpload}
              onDismiss={(id) => {
                dismissUploads(new Set([id]));
              }}
            />
          ))}
          {visible.map((job) => (
            <JobRow
              key={job.id}
              job={job}
              name={runName(job)}
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
