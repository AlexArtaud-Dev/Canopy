import 'server-only';

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { changelogFile, parseVersion, type ChangelogFile } from '@canopy/contracts/changelog';
import { parse } from 'yaml';

import { logger } from '@/shared/lib/logger';

import packageJson from '../../../../package.json';
import {
  isDevBuild,
  latestVersion,
  orderReleases,
  unreleased,
  type Release,
} from '../whats-new.utils';

const log = logger.child({ module: 'whats-new' });

/** The changelog folder: shipped next to the server in the image, the repository's in dev. */
function changelogDir(): string {
  return process.env.CANOPY_CHANGELOG_DIR ?? path.resolve(process.cwd(), '../../changelog');
}

async function readChangelog(file: string): Promise<ChangelogFile> {
  const result = changelogFile.safeParse(parse(await readFile(file, 'utf8')) ?? { entries: [] });
  if (!result.success) throw new Error(`invalid changelog file ${path.basename(file)}`);
  return result.data;
}

async function readReleases(dir: string): Promise<Release[]> {
  const names = await readdir(path.join(dir, 'releases'));
  const versions = names
    .filter((name) => name.endsWith('.yaml'))
    .map((name) => name.slice(0, -'.yaml'.length))
    .filter((version) => parseVersion(version) !== null);
  const releases = await Promise.all(
    versions.map(async (version) => {
      try {
        const file = await readChangelog(path.join(dir, 'releases', `${version}.yaml`));
        return { version, date: file.date ?? null, entries: file.entries };
      } catch (error) {
        log.warn('changelog release skipped', { version, error });
        return null;
      }
    }),
  );
  return releases.filter((release) => release !== null);
}

export interface WhatsNew {
  /** This build's version (`0.0.0` before the first release). */
  version: string;
  dev: boolean;
  releases: Release[];
  /** Newest released version, for the "new since your last visit" badge. */
  latest: string | null;
}

let cached: Promise<WhatsNew> | null = null;

async function load(): Promise<WhatsNew> {
  const version = packageJson.version;
  const dev = isDevBuild(version, process.env.NODE_ENV);
  const dir = changelogDir();
  try {
    const [releases, pending] = await Promise.all([
      readReleases(dir),
      // Images ship released versions only: Unreleased is optional.
      dev ? readChangelog(path.join(dir, 'unreleased.yaml')).catch(() => null) : null,
    ]);
    const unreleasedRelease = pending
      ? { version: unreleased, date: null, entries: pending.entries }
      : null;
    const ordered = orderReleases(releases, unreleasedRelease);
    return { version, dev, releases: ordered, latest: latestVersion(ordered) };
  } catch (error) {
    log.warn('changelog unavailable', { dir, error });
    return { version, dev, releases: [], latest: null };
  }
}

/**
 * The changelog of this build. Release files never change while a build runs, so they are read
 * once; in development they are read again each time, so new entries show up.
 */
export function loadWhatsNew(): Promise<WhatsNew> {
  if (process.env.NODE_ENV !== 'production') return load();
  cached ??= load();
  return cached;
}
