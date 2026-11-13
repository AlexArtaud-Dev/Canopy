import type { Job } from '@canopy/contracts';

import {
  baseName,
  canRetry,
  dockJobs,
  isQuietRun,
  dockSummary,
  finishedTransition,
  isActive,
  jobPercent,
  recentJobMs,
  resultText,
  retryableKinds,
  splitDuration,
  upsertJob,
} from './jobs.utils';

function job(overrides: Partial<Job>): Job {
  return {
    id: 'a',
    kind: 'folder_size',
    ownerId: 'u',
    state: 'running',
    bytesDone: 0,
    itemsDone: 0,
    createdAt: '2026-11-08T10:00:00Z',
    ...overrides,
  };
}

describe('jobPercent', () => {
  it('uses bytes, then items, and is null while only counting', () => {
    expect(jobPercent(job({ bytesDone: 50, bytesTotal: 200 }))).toBe(25);
    expect(jobPercent(job({ itemsDone: 3, itemsTotal: 4 }))).toBe(75);
    expect(jobPercent(job({ bytesDone: 500, bytesTotal: 200 }))).toBe(100);
    expect(jobPercent(job({ itemsDone: 9, itemsTotal: 4 }))).toBe(100);
    expect(jobPercent(job({ bytesTotal: 0 }))).toBeNull();
    expect(jobPercent(job({}))).toBeNull();
    expect(jobPercent(job({ state: 'succeeded' }))).toBe(100);
  });
});

describe('upsertJob', () => {
  it('replaces by id and keeps the newest first', () => {
    const older = job({ id: 'old', createdAt: '2026-11-08T09:00:00Z' });
    const newer = job({ id: 'new', createdAt: '2026-11-08T11:00:00Z' });
    const list = upsertJob(upsertJob([], older), newer);
    expect(list.map((item) => item.id)).toEqual(['new', 'old']);
    const updated = upsertJob(list, { ...older, state: 'succeeded' });
    expect(updated).toHaveLength(2);
    expect(updated[1]?.state).toBe('succeeded');
  });
});

describe('dockJobs and dockSummary', () => {
  const now = new Date('2026-11-08T12:00:00Z');
  const running = job({ id: 'r' });
  const recent = job({ id: 'd', state: 'succeeded', finishedAt: '2026-11-08T11:30:00Z' });
  const old = job({ id: 'o', state: 'failed', finishedAt: '2026-11-08T09:00:00Z' });
  const noFinish = job({ id: 'n', state: 'cancelled', createdAt: '2026-11-08T11:59:00Z' });

  it('keeps active and recent unless dismissed', () => {
    expect(
      dockJobs([running, recent, old, noFinish], new Set(), now).map((item) => item.id),
    ).toEqual(['r', 'd', 'n']);
    expect(dockJobs([running, recent], new Set(['d', 'r']), now).map((item) => item.id)).toEqual([
      'r',
    ]);
    expect(recentJobMs).toBe(3_600_000);
  });

  it('shows runs done on behalf of the person only when they fail', () => {
    const quiet = new Set(['cast.find']);
    const search = job({ id: 's', kind: 'command', target: 'cast.find' });
    const failed = job({
      id: 'f',
      kind: 'command',
      target: 'cast.find',
      state: 'failed',
      finishedAt: '2026-11-08T11:30:00Z',
    });
    const other = job({ id: 'p', kind: 'command', target: 'cast.play' });
    expect(dockJobs([search, failed, other], new Set(), now, quiet).map((item) => item.id)).toEqual(
      ['f', 'p'],
    );
    expect(isQuietRun(search, quiet)).toBe(true);
    expect(isQuietRun({ ...search, kind: 'folder_size' }, quiet)).toBe(false);
    expect(isQuietRun({ kind: 'command', state: 'running' }, quiet)).toBe(false);
  });

  it('counts by outcome', () => {
    expect(dockSummary([running, recent, old, noFinish])).toEqual({
      active: 1,
      failed: 1,
      done: 2,
    });
    expect(isActive(job({ state: 'queued' }))).toBe(true);
  });
});

describe('finishedTransition', () => {
  it('fires once, when an active job finishes', () => {
    expect(finishedTransition('running', job({ state: 'succeeded' }))).toBe('succeeded');
    expect(finishedTransition('queued', job({ state: 'failed' }))).toBe('failed');
    expect(finishedTransition('succeeded', job({ state: 'succeeded' }))).toBeNull();
    expect(finishedTransition(undefined, job({ state: 'succeeded' }))).toBeNull();
    expect(finishedTransition('queued', job({ state: 'running' }))).toBeNull();
  });
});

describe('helpers', () => {
  it('splits durations', () => {
    expect(splitDuration(3725)).toEqual({ hours: 1, minutes: 2, seconds: 5 });
    expect(splitDuration(-4)).toEqual({ hours: 0, minutes: 0, seconds: 0 });
  });

  it('names the last path segment', () => {
    expect(baseName('/media/photos')).toBe('photos');
    expect(baseName('/')).toBe('/');
  });

  it('retries failed or cancelled jobs of retryable kinds', () => {
    expect(canRetry(job({ state: 'failed', target: '/a' }))).toBe(true);
    expect(canRetry(job({ state: 'cancelled', target: '/a' }))).toBe(true);
    expect(canRetry(job({ state: 'succeeded', target: '/a' }))).toBe(false);
    expect(canRetry(job({ state: 'failed' }))).toBe(false);
    expect(canRetry(job({ state: 'failed', kind: 'copy', target: '/a' }))).toBe(false);
    expect(retryableKinds.has('folder_size')).toBe(true);
  });
});

describe('resultText', () => {
  it('keeps strings only', () => {
    expect(resultText('/a.zip')).toBe('/a.zip');
    expect(resultText(3)).toBe('');
    expect(resultText(undefined)).toBe('');
  });
});
