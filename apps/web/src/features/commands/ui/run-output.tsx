'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import type { JobLogLine } from '@canopy/contracts';
import { cn } from 'cn';
import { Spinner } from '@/shared/ui/spinner';
import { isActive, useJob } from '@/features/jobs';

import { loadJobLogs } from '../server/commands-actions';

const logPollMs = 1000;

/**
 * The run's state and output, read every second while it runs (the operations panel shows
 * progress). When the job ends the jobs stream refreshes the file listings.
 */
export function RunOutput({ jobId }: { jobId: string }) {
  const t = useTranslations('commands.page');
  const job = useJob(jobId);
  const [lines, setLines] = useState<JobLogLine[]>([]);
  const lastSeq = useRef(0);
  const bottom = useRef<HTMLDivElement>(null);
  const running = !job || isActive(job);

  useEffect(() => {
    let stopped = false;
    const read = async () => {
      const result = await loadJobLogs({ jobId, after: lastSeq.current });
      if (stopped || !result.ok || result.data.length === 0) return;
      lastSeq.current = Math.max(lastSeq.current, result.data.at(-1)?.seq ?? 0);
      // Two reads can overlap (the run ending while one is in flight): keep each line once.
      setLines((current) => {
        const last = current.at(-1)?.seq ?? 0;
        return [...current, ...result.data.filter((line) => line.seq > last)];
      });
    };
    void read();
    const timer = running ? window.setInterval(() => void read(), logPollMs) : undefined;
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [jobId, running]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'nearest' });
  }, [lines.length]);

  return (
    <section className="grid gap-2" aria-label={t('output')}>
      <p className="flex items-center gap-2 text-sm font-medium" aria-live="polite">
        {running && <Spinner />}
        {/* i18n-dynamic: commands.page.state */}
        {t(`state.${job?.state ?? 'queued'}`)}
      </p>
      <div className="bg-muted max-h-80 overflow-auto rounded-md p-3 font-mono text-xs">
        {lines.length === 0 ? (
          <p className="text-muted-foreground font-sans">{t('noOutput')}</p>
        ) : (
          lines.map((line) => (
            <p
              key={line.seq}
              className={cn(
                'whitespace-pre-wrap break-all',
                line.level !== 'info' && 'text-destructive',
              )}
            >
              {line.line}
            </p>
          ))
        )}
        <div ref={bottom} />
      </div>
    </section>
  );
}
