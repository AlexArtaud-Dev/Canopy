import { z } from 'zod';

/** The release asset every plugin release carries. */
export const manifestAssetName = 'canopy-plugin.yaml';

/** The manifest and the checksum file are small; anything larger is refused unread. */
export const maxTextAssetBytes = 64 * 1024;

/** Release notes beyond this are cut: the page shows a summary, the release page has the rest. */
export const maxNotesLength = 4000;

const repoPattern = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;

/** The allowlist setting as GitHub `owner/name` entries; junk is dropped, duplicates kept once. */
export function parseRepos(text: string): string[] {
  const seen = new Set<string>();
  const repos: string[] = [];
  for (const candidate of text.split(/[\s,]+/)) {
    const key = candidate.toLowerCase();
    if (!repoPattern.test(candidate) || seen.has(key)) continue;
    seen.add(key);
    repos.push(candidate);
  }
  return repos;
}

export function sameRepo(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/** The fields Canopy reads from GitHub's "latest release" answer. */
export const githubReleaseSchema = z.object({
  tag_name: z.string().min(1).max(128),
  html_url: z.url(),
  published_at: z.string().nullable(),
  body: z
    .string()
    .nullable()
    .transform((notes) => (notes ?? '').slice(0, maxNotesLength)),
  assets: z
    .array(
      z.object({
        name: z.string().max(256),
        browser_download_url: z.url(),
        size: z.number().int().nonnegative(),
      }),
    )
    .max(500),
});

export type GithubRelease = z.infer<typeof githubReleaseSchema>;
export type GithubAsset = GithubRelease['assets'][number];

/** A release as the admin page shows it. */
export interface ReleaseView {
  version: string;
  notes: string;
  url: string;
  publishedAt: string | null;
}

/** What the page knows about an allowlisted repository's latest release. */
export interface RepoView {
  repo: string;
  release: ReleaseView | null;
  /** Translatable code when the release could not be read. */
  error: string | null;
}

export function releaseVersion(tag: string): string {
  return tag.replace(/^v/, '');
}

export function toReleaseView(release: GithubRelease): ReleaseView {
  return {
    version: releaseVersion(release.tag_name),
    notes: release.body,
    url: release.html_url,
    publishedAt: release.published_at,
  };
}

/** Numbers and pre-release of a version; build metadata (`+…`) does not count. */
function versionParts(value: string): { numbers: number[]; pre: string | undefined } {
  const withoutBuild = releaseVersion(value).replace(/\+.*$/s, '');
  const dash = withoutBuild.indexOf('-');
  const core = dash < 0 ? withoutBuild : withoutBuild.slice(0, dash);
  return {
    numbers: core.split('.').map((part) => Number.parseInt(part, 10) || 0),
    pre: dash < 0 ? undefined : withoutBuild.slice(dash + 1),
  };
}

/** Semantic version order (1.2.10 after 1.2.9; a pre-release before its release). */
export function compareVersions(a: string, b: string): number {
  const left = versionParts(a);
  const right = versionParts(b);
  for (let index = 0; index < 3; index += 1) {
    const difference = (left.numbers[index] ?? 0) - (right.numbers[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  if (left.pre === right.pre) return 0;
  if (left.pre === undefined) return 1;
  if (right.pre === undefined) return -1;
  return Math.sign(left.pre.localeCompare(right.pre));
}

/** An update is offered for a newer release, unless the plugin is pinned. */
export function updateAvailable(installed: string, latest: string, pinned: boolean): boolean {
  return !pinned && compareVersions(latest, installed) > 0;
}

export function findAsset(release: GithubRelease, name: string): GithubAsset | undefined {
  return release.assets.find((asset) => asset.name === name);
}

/** Downloads only come from the repository's own release files, never from another host. */
export function isReleaseDownload(url: string, repo: string): boolean {
  const prefix = `https://github.com/${repo}/releases/download/`.toLowerCase();
  return url.toLowerCase().startsWith(prefix) && !url.includes('..');
}

/**
 * The text parts and the closing of a streamed `multipart/form-data` body: text fields, then the
 * binary part's header; the binary bytes go between `head` and `tail`.
 */
export function multipartFrame(
  boundary: string,
  fields: readonly (readonly [string, string])[],
  fileField: string,
): { head: string; tail: string } {
  const texts = fields
    .map(
      ([name, value]) =>
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
    )
    .join('');
  const file =
    `--${boundary}\r\nContent-Disposition: form-data; name="${fileField}"; filename="${fileField}"\r\n` +
    'Content-Type: application/octet-stream\r\n\r\n';
  return { head: texts + file, tail: `\r\n--${boundary}--\r\n` };
}

export const flagsSchema = z.object({
  id: z.string().min(1).max(32),
  enabled: z.boolean(),
  pinned: z.boolean(),
});

export const pluginIdSchema = z.object({ id: z.string().min(1).max(32) });

export const installSchema = z.object({ repo: z.string().regex(repoPattern) });
