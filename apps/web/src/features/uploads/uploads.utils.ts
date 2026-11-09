/** Where tus clients create uploads (relayed to the engine outside Next). */
export const uploadEndpoint = '/api/engine/stream/v1/uploads/';

/** Bytes per request: bounded requests resume cleanly and keep the stream ticket fresh. */
export const uploadChunkSize = 32 * 1024 * 1024;

/** Files sent at once; the rest wait their turn. */
export const uploadConcurrency = 3;

export type UploadStrategy = 'skip' | 'overwrite' | 'keep_both';

export type UploadState = 'queued' | 'uploading' | 'done' | 'skipped' | 'failed' | 'cancelled';

export interface UploadItem {
  id: string;
  name: string;
  /** Folder the person dropped into, and the sub-folders of a folder upload. */
  destination: string;
  relativeDir: string;
  size: number;
  sent: number;
  state: UploadState;
  /** Final path (renamed when both were kept). */
  storedAt: string | null;
  errorCode: string | null;
  startedAt: number | null;
  finishedAt: number | null;
}

/** A picked or dropped file with the folders above it (folder uploads). */
export interface PickedFile {
  file: File;
  relativeDir: string;
}

/** Sub-folders of a picked file: "trip/day 1/a.jpg" → "trip/day 1". */
export function relativeDirOf(relativePath: string): string {
  const slash = relativePath.lastIndexOf('/');
  return slash > 0 ? relativePath.slice(0, slash) : '';
}

/** The name an upload occupies in the destination: its top folder, or the file itself. */
export function topLevelName(picked: { name: string; relativeDir: string }): string {
  const [top] = picked.relativeDir.split('/');
  return top && top !== '' ? top : picked.name;
}

/** tus metadata read by the engine (all values are strings). */
export function uploadMetadata(item: {
  destination: string;
  name: string;
  relativeDir: string;
  strategy: UploadStrategy;
}): Record<string, string> {
  return {
    destination: item.destination,
    filename: item.name,
    relativeDir: item.relativeDir,
    strategy: item.strategy,
  };
}

/** A free "name (n).ext" next to taken names (folders keep their dots), as the engine does. */
export function keepBothName(
  name: string,
  isDirectory: boolean,
  taken: (candidate: string) => boolean,
): string {
  let stem = name;
  let extension = '';
  const dot = name.lastIndexOf('.');
  if (!isDirectory && dot > 0) {
    stem = name.slice(0, dot);
    extension = name.slice(dot);
  }
  for (let n = 1; ; n += 1) {
    const candidate = `${stem} (${String(n)})${extension}`;
    if (!taken(candidate)) return candidate;
  }
}

/**
 * Applies the conflict choices to a batch: a folder kept twice is renamed client-side (its files
 * then never conflict); everything else carries the strategy chosen for its top-level name.
 */
export function planUploads(
  files: readonly PickedFile[],
  existing: ReadonlySet<string>,
  choices: Readonly<Record<string, UploadStrategy>>,
  fallback: UploadStrategy,
): { file: File; relativeDir: string; strategy: UploadStrategy }[] {
  const renamed = new Map<string, string>();
  const taken = new Set(existing);
  return files.flatMap(({ file, relativeDir }) => {
    const top = topLevelName({ name: file.name, relativeDir });
    const strategy = existing.has(top) ? (choices[top] ?? fallback) : 'skip';
    if (relativeDir === '' || strategy !== 'keep_both') return [{ file, relativeDir, strategy }];
    let folder = renamed.get(top);
    if (!folder) {
      folder = keepBothName(top, true, (candidate) => taken.has(candidate));
      taken.add(folder);
      renamed.set(top, folder);
    }
    const rest = relativeDir.slice(top.length);
    return [{ file, relativeDir: folder + rest, strategy: 'skip' as const }];
  });
}

/** The translated code in a tus refusal body ("files.exists: Conflict"), if any. */
export function refusalCode(body: string | undefined | null): string | null {
  const match = /^([a-z_]+\.[a-z_]+):/.exec(body ?? '');
  return match?.[1] ?? null;
}

export function isActive(item: Pick<UploadItem, 'state'>): boolean {
  return item.state === 'queued' || item.state === 'uploading';
}

/** 0–100. */
export function uploadPercent(item: Pick<UploadItem, 'sent' | 'size' | 'state'>): number {
  if (item.state === 'done' || item.size === 0) return item.state === 'done' ? 100 : 0;
  return Math.min(100, Math.floor((item.sent / item.size) * 100));
}

/** Bytes per second since the upload started, once there is something to measure. */
export function uploadRate(
  item: Pick<UploadItem, 'sent' | 'startedAt'>,
  now: number,
): number | null {
  if (item.startedAt === null) return null;
  const seconds = (now - item.startedAt) / 1000;
  return seconds >= 1 && item.sent > 0 ? Math.round(item.sent / seconds) : null;
}
