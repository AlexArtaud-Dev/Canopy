'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import type { Job } from '@canopy/contracts';
import { isActive, useJobList } from '@/features/jobs';

import { parseCastDetail, type CastState } from '../devices.utils';
import { loadRuns } from '../server/remote-actions';
import type { DeviceRun } from '../server/devices-store';

export const castsQueryKey = ['devices', 'casts'] as const;

/** A cast playing now: what was started, and where its run is. */
export interface LiveCast {
  run: DeviceRun;
  job: Job;
  /** Null until the plugin reports (the screen is starting). */
  state: CastState | null;
}

/**
 * The person's casts still running, from the casts remembered and the live operations (whose
 * progress carries what the plugin says: position, state, volume).
 */
export function useCasts(): LiveCast[] {
  const jobs = useJobList();
  const { data: runs } = useQuery({
    queryKey: castsQueryKey,
    queryFn: async () => {
      const result = await loadRuns();
      return result.ok ? result.data : [];
    },
    staleTime: 30_000,
  });
  return useMemo(() => {
    const byId = new Map(jobs.map((job) => [job.id, job]));
    return (runs ?? []).flatMap((run) => {
      const job = byId.get(run.jobId);
      return job && isActive(job) ? [{ run, job, state: parseCastDetail(job.currentPath) }] : [];
    });
  }, [jobs, runs]);
}
