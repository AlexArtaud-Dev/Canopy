'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import type { Job, JobState } from '@canopy/contracts';
import { zJob } from '@canopy/contracts/zod';

import { filesystemQueryRoot } from '@/shared/query/query-keys';

import { finishedTransition, upsertJob } from '../jobs.utils';
import { listMyJobs } from '../server/jobs-actions';

export const jobsQueryKey = ['jobs'] as const;

async function fetchJobs(): Promise<Job[]> {
  const response = await listMyJobs();
  // A failed refresh keeps showing what we had; the stream catches up.
  return response.ok ? response.data : [];
}

/** One job, kept live by the operations panel's event stream (they share the cache). */
export function useJob(id: string | null): Job | undefined {
  const query = useQuery({ queryKey: jobsQueryKey, queryFn: fetchJobs, enabled: id !== null });
  return id === null ? undefined : query.data?.find((job) => job.id === id);
}

/** Event stream relayed by the web app (the engine token never reaches the browser). */
const eventsUrl = '/api/engine/v1/jobs/events';

/**
 * Recent jobs, kept live by the engine's event stream. `onFinished` fires once per job reaching
 * a final state while this page is open.
 */
export function useJobs(onFinished: (job: Job, state: JobState) => void) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: jobsQueryKey,
    queryFn: fetchJobs,
  });

  const lastStates = useRef(new Map<string, JobState>());
  const finishedRef = useRef(onFinished);
  useEffect(() => {
    finishedRef.current = onFinished;
  }, [onFinished]);

  useEffect(() => {
    for (const job of query.data ?? []) {
      if (!lastStates.current.has(job.id)) lastStates.current.set(job.id, job.state);
    }
  }, [query.data]);

  useEffect(() => {
    const source = new EventSource(eventsUrl);
    source.addEventListener('job', (event: MessageEvent<string>) => {
      const raw: unknown = JSON.parse(event.data);
      // Validate only: the schema coerces int64 to bigint, while the SDK (and the Job type) keep
      // JSON numbers, which are exact far beyond any realistic byte count.
      if (!zJob.safeParse(raw).success) return;
      const job = raw as Job;
      const finished = finishedTransition(lastStates.current.get(job.id) ?? 'queued', job);
      lastStates.current.set(job.id, job.state);
      queryClient.setQueryData<Job[]>(jobsQueryKey, (jobs) => upsertJob(jobs ?? [], job));
      if (finished) {
        // Whatever the job changed on disk, open folders show it now.
        void queryClient.invalidateQueries({ queryKey: [filesystemQueryRoot] });
        finishedRef.current(job, finished);
      }
    });
    // After a reconnect (lifetime reached, network blip) events may have been missed: resync.
    source.addEventListener('open', () => {
      void queryClient.invalidateQueries({ queryKey: jobsQueryKey });
    });
    return () => {
      source.close();
    };
  }, [queryClient]);

  return query.data ?? [];
}
