import type { DeletePlan } from '@canopy/contracts';

import {
  daysLeft,
  deleteDialogFor,
  idsInputSchema,
  originalFolder,
  pathsInputSchema,
} from './trash.utils';

describe('trash utils', () => {
  it('counts the days left before retention', () => {
    const now = new Date('2026-11-09T12:00:00Z');
    expect(daysLeft('2026-11-09T12:00:00Z', 30, now)).toBe(30);
    expect(daysLeft('2026-10-12T00:00:00Z', 30, now)).toBe(1);
    expect(daysLeft('2026-10-11T00:00:00Z', 30, now)).toBe(0);
    expect(daysLeft('2026-01-01T00:00:00Z', 30, now)).toBe(0);
  });

  it('finds where an item was', () => {
    expect(originalFolder('/media/photos/a.jpg')).toBe('/media/photos');
    expect(originalFolder('/media')).toBe('/');
  });

  it('validates inputs', () => {
    expect(pathsInputSchema.safeParse({ paths: ['/a'] }).success).toBe(true);
    expect(pathsInputSchema.safeParse({ paths: ['/a/../b'] }).success).toBe(false);
    expect(pathsInputSchema.safeParse({ paths: [] }).success).toBe(false);
    expect(idsInputSchema.safeParse({ ids: ['0'.repeat(32)] }).success).toBe(true);
    expect(idsInputSchema.safeParse({ ids: ['../x'] }).success).toBe(false);
  });

  it('asks the trash, a permanent delete or nothing, by size and by right', () => {
    const plan = (fitsTrash: boolean): DeletePlan => ({
      bytes: 1,
      files: 1,
      complete: true,
      fitsTrash,
      limits: { retentionDays: 30, maxBytes: 10, maxFiles: 10 },
    });
    const paths = ['/v/a'];
    expect(deleteDialogFor(paths, plan(true), false, true).kind).toBe('trash');
    expect(deleteDialogFor(paths, plan(true), true, true)).toMatchObject({
      kind: 'permanent',
      asked: true,
    });
    expect(deleteDialogFor(paths, plan(false), false, true)).toMatchObject({
      kind: 'permanent',
      asked: false,
    });
    // Without the right, Shift+Delete falls back to the trash; too big for it, nothing is done.
    expect(deleteDialogFor(paths, plan(true), true, false).kind).toBe('trash');
    expect(deleteDialogFor(paths, plan(false), false, false).kind).toBe('blocked');
  });
});
