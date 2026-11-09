import type { ChangelogEntry } from '@canopy/contracts/changelog';

import {
  groupByType,
  isDevBuild,
  isNewSince,
  issuesUrl,
  latestVersion,
  orderReleases,
  unreleased,
  type Release,
} from './whats-new.utils';

const entry = (type: ChangelogEntry['type'], issue: number): ChangelogEntry => ({
  type,
  scope: 'files',
  issue,
  text: { en: 'en', fr: 'fr', es: 'es' },
});
const release = (version: string, entries: ChangelogEntry[] = [entry('feat', 1)]): Release => ({
  version,
  date: '2026-11-09',
  entries,
});

describe("what's new", () => {
  it('tells development builds apart', () => {
    expect(isDevBuild('0.0.0', 'production')).toBe(true);
    expect(isDevBuild('2026.11.0', 'development')).toBe(true);
    expect(isDevBuild('2026.11.0', undefined)).toBe(true);
    expect(isDevBuild('2026.11.0', 'production')).toBe(false);
  });

  it('orders releases newest first, Unreleased on top when not empty', () => {
    const pending: Release = { version: unreleased, date: null, entries: [entry('fix', 2)] };
    const ordered = orderReleases([release('2026.9.0'), release('2026.11.1')], pending);
    expect(ordered.map((item) => item.version)).toEqual([unreleased, '2026.11.1', '2026.9.0']);
    expect(orderReleases([release('2026.9.0')], { ...pending, entries: [] })).toHaveLength(1);
    expect(orderReleases([], null)).toEqual([]);
  });

  it('groups entries by type in changelog order', () => {
    expect(groupByType([entry('fix', 2), entry('feat', 1), entry('fix', 3)])).toEqual([
      { type: 'feat', entries: [entry('feat', 1)] },
      { type: 'fix', entries: [entry('fix', 2), entry('fix', 3)] },
    ]);
  });

  it('finds the latest release and what is new since the last visit', () => {
    const pending: Release = { version: unreleased, date: null, entries: [entry('fix', 2)] };
    expect(latestVersion([pending, release('2026.11.1')])).toBe('2026.11.1');
    expect(latestVersion([pending])).toBeNull();
    expect(isNewSince('2026.11.1', null)).toBe(true);
    expect(isNewSince('2026.11.1', '2026.11.0')).toBe(true);
    expect(isNewSince('2026.11.0', '2026.11.0')).toBe(false);
    expect(isNewSince('2026.10.0', '2026.11.0')).toBe(false);
    expect(isNewSince(unreleased, null)).toBe(false);
    expect(issuesUrl).toMatch(/\/issues$/);
  });
});
