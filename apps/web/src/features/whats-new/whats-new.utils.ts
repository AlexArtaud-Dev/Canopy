import {
  changeTypes,
  compareVersionsDesc,
  type ChangeType,
  type ChangelogEntry,
} from '@canopy/contracts/changelog';

/** Where issues live, for the links next to each change. */
export const issuesUrl = 'https://github.com/AlexArtaud-Dev/Canopy/issues';

/** Stands in for a version number on the section of changes not released yet. */
export const unreleased = 'unreleased';

export interface Release {
  /** CalVer version, or `unreleased`. */
  version: string;
  /** `YYYY-MM-DD`, absent for Unreleased. */
  date: string | null;
  entries: ChangelogEntry[];
}

/** A development build: no release version yet, or not a production run. */
export function isDevBuild(version: string, nodeEnv: string | undefined): boolean {
  return version === '0.0.0' || nodeEnv !== 'production';
}

/** Releases newest first, with Unreleased on top when it is shown and not empty. */
export function orderReleases(releases: readonly Release[], pending: Release | null): Release[] {
  const sorted = [...releases].sort((a, b) => compareVersionsDesc(a.version, b.version));
  return pending && pending.entries.length > 0 ? [pending, ...sorted] : sorted;
}

/** The entries of a release grouped by type, in the changelog's type order. */
export function groupByType(
  entries: readonly ChangelogEntry[],
): { type: ChangeType; entries: ChangelogEntry[] }[] {
  return changeTypes
    .map((type) => ({ type, entries: entries.filter((entry) => entry.type === type) }))
    .filter((group) => group.entries.length > 0);
}

/** The newest released version (Unreleased does not count), or null when there is none. */
export function latestVersion(releases: readonly Release[]): string | null {
  return releases.find((release) => release.version !== unreleased)?.version ?? null;
}

/** A release the person has not opened "What's new" since. */
export function isNewSince(version: string, lastSeen: string | null): boolean {
  if (version === unreleased) return false;
  return lastSeen === null || compareVersionsDesc(version, lastSeen) < 0;
}
