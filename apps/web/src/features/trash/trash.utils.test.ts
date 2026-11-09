import { daysLeft, idsInputSchema, originalFolder, pathsInputSchema } from './trash.utils';

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
});
