import type { Job, JobState } from '@canopy/contracts';

/** Finished jobs stay in the dock this long (unless dismissed), so results can be read. */
export const recentJobMs = 60 * 60 * 1000;

const activeStates: ReadonlySet<JobState> = new Set(['queued', 'running']);

export function isActive(job: Pick<Job, 'state'>): boolean {
  return activeStates.has(job.state);
}

/** 0–100 when a total is known (bytes first, then items), null while only counting. */
export function jobPercent(job: Job): number | null {
  if (job.state === 'succeeded') return 100;
  if (job.bytesTotal && job.bytesTotal > 0) {
    return Math.min(100, Math.floor((job.bytesDone / job.bytesTotal) * 100));
  }
  if (job.itemsTotal && job.itemsTotal > 0) {
    return Math.min(100, Math.floor((job.itemsDone / job.itemsTotal) * 100));
  }
  return null;
}

/** Inserts or replaces a job, newest first (a list from the server or a live event). */
export function upsertJob(jobs: readonly Job[], job: Job): Job[] {
  const others = jobs.filter((candidate) => candidate.id !== job.id);
  return [...others, job].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Jobs the dock shows: every active one, plus recent finished ones not dismissed. */
export function dockJobs(jobs: readonly Job[], dismissed: ReadonlySet<string>, now: Date): Job[] {
  return jobs.filter((job) => {
    if (isActive(job)) return true;
    if (dismissed.has(job.id)) return false;
    const finished = Date.parse(job.finishedAt ?? job.createdAt);
    return now.getTime() - finished <= recentJobMs;
  });
}

export interface DockSummary {
  active: number;
  failed: number;
  done: number;
}

export function dockSummary(jobs: readonly Job[]): DockSummary {
  return {
    active: jobs.filter(isActive).length,
    failed: jobs.filter((job) => job.state === 'failed').length,
    done: jobs.filter((job) => job.state === 'succeeded' || job.state === 'cancelled').length,
  };
}

/** The state a job just reached when it finishes, so the UI can notify once. */
export function finishedTransition(previous: JobState | undefined, next: Job): JobState | null {
  if (previous === undefined || !activeStates.has(previous) || isActive(next)) return null;
  return next.state;
}

/** Whole hours, minutes and seconds of a duration (ETA display). */
export function splitDuration(totalSeconds: number): {
  hours: number;
  minutes: number;
  seconds: number;
} {
  const clamped = Math.max(0, Math.round(totalSeconds));
  return {
    hours: Math.floor(clamped / 3600),
    minutes: Math.floor((clamped % 3600) / 60),
    seconds: clamped % 60,
  };
}

/** Last segment of a virtual path, for compact display ("/" stays "/"). */
export function baseName(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  return name === '' ? '/' : name;
}

/** Kinds that can simply run again on the same target. */
export const retryableKinds: ReadonlySet<string> = new Set(['folder_size']);

export function canRetry(job: Job): boolean {
  return (
    (job.state === 'failed' || job.state === 'cancelled') &&
    retryableKinds.has(job.kind) &&
    job.target !== undefined
  );
}
