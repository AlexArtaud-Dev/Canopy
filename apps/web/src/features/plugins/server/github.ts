import 'server-only';

import { AppBaseError } from '@/shared/lib/errors';

import {
  githubReleaseSchema,
  isReleaseDownload,
  maxTextAssetBytes,
  type GithubRelease,
} from '../plugins.utils';

const apiTimeoutMs = 15_000;
/** Binaries can take a while on a slow link; the engine bounds their size. */
const binaryTimeoutMs = 5 * 60_000;

const headers = {
  accept: 'application/vnd.github+json',
  'user-agent': 'Canopy',
  'x-github-api-version': '2022-11-28',
};

function unreachable(cause?: unknown): AppBaseError {
  return new AppBaseError('plugins.github_unavailable', 'GitHub did not answer', { cause });
}

async function get(url: string, timeoutMs: number): Promise<Response> {
  try {
    return await fetch(url, { headers, cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    throw unreachable(error);
  }
}

/** The repository's latest published release (drafts and pre-releases are skipped by GitHub). */
export async function latestRelease(repo: string): Promise<GithubRelease> {
  const response = await get(`https://api.github.com/repos/${repo}/releases/latest`, apiTimeoutMs);
  if (response.status === 404) throw new AppBaseError('plugins.no_release', 'no release');
  if (!response.ok) throw unreachable();
  const parsed = githubReleaseSchema.safeParse(await response.json());
  if (!parsed.success) throw unreachable(parsed.error);
  return parsed.data;
}

function checkedUrl(url: string, repo: string): string {
  if (!isReleaseDownload(url, repo)) {
    throw new AppBaseError('plugins.invalid_manifest', 'asset outside the repository releases');
  }
  return url;
}

/** A small release file (manifest, checksums), refused when larger than it should be. */
export async function downloadText(url: string, repo: string): Promise<string> {
  const response = await get(checkedUrl(url, repo), apiTimeoutMs);
  if (!response.ok) throw unreachable();
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > maxTextAssetBytes) throw new AppBaseError('plugins.invalid_manifest', 'too large');
  const data = await response.arrayBuffer();
  if (data.byteLength > maxTextAssetBytes) {
    throw new AppBaseError('plugins.invalid_manifest', 'too large');
  }
  return new TextDecoder().decode(data);
}

/** The binary as a stream: it goes to the engine without being held in memory. */
export async function downloadBinary(
  url: string,
  repo: string,
): Promise<ReadableStream<Uint8Array>> {
  const response = await get(checkedUrl(url, repo), binaryTimeoutMs);
  if (!response.ok || !response.body) throw unreachable();
  return response.body;
}
