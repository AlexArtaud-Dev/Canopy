'use client';

import { Upload, type DetailedError } from 'tus-js-client';

import { refreshStreamTicket } from '@/features/files/server/stream-ticket';

import {
  isActive,
  refusalCode,
  uploadChunkSize,
  uploadConcurrency,
  uploadEndpoint,
  uploadMetadata,
  type UploadItem,
  type UploadStrategy,
} from '../uploads.utils';
import { uploadStore } from './upload-store';

/** Ask for a new stream ticket this long before the current one expires. */
const ticketMarginMs = 30_000;

let ticketExpiresAt = 0;
let ticketRequest: Promise<void> | null = null;

/** One ticket refresh at a time, shared by every upload request that needs it. */
async function ensureTicket(): Promise<void> {
  if (Date.now() < ticketExpiresAt - ticketMarginMs) return;
  ticketRequest ??= refreshStreamTicket()
    .then((result) => {
      if (!result.ok) throw new Error(result.error.code);
      ticketExpiresAt = result.data.expiresAt;
    })
    .finally(() => {
      ticketRequest = null;
    });
  await ticketRequest;
}

const controls = new Map<string, Upload>();
const waiting: string[] = [];
let finishedListener: (item: UploadItem) => void = () => undefined;

/** Called whenever a file finishes, whatever the outcome (refresh folders, notify). */
export function onUploadFinished(listener: (item: UploadItem) => void): void {
  finishedListener = listener;
}

function finish(id: string, change: Partial<UploadItem>): void {
  // A failed upload keeps its handle: retrying resumes it from what the engine already has.
  if (change.state !== 'failed') controls.delete(id);
  uploadStore.update(id, { ...change, finishedAt: Date.now() });
  const item = uploadStore.get(id);
  if (item) finishedListener(item);
  pump();
}

function running(): number {
  return uploadStore.all().filter((item) => item.state === 'uploading').length;
}

/** Starts queued files while fewer than uploadConcurrency are running. */
function pump(): void {
  while (running() < uploadConcurrency && waiting.length > 0) {
    const id = waiting.shift();
    const upload = id ? controls.get(id) : undefined;
    if (!id || !upload) continue;
    uploadStore.update(id, { state: 'uploading', startedAt: Date.now(), errorCode: null });
    upload.start();
  }
}

function create(item: UploadItem, file: File, strategy: UploadStrategy): Upload {
  let result: { path: string | null; skipped: boolean } = { path: null, skipped: false };
  return new Upload(file, {
    endpoint: uploadEndpoint,
    chunkSize: uploadChunkSize,
    retryDelays: [0, 1000, 3000, 5000, 10_000, 20_000],
    metadata: uploadMetadata({ ...item, strategy }),
    // Resuming after a reload would need the file picked again: retries cover network blips.
    storeFingerprintForResuming: false,
    onBeforeRequest: () => ensureTicket(),
    onProgress: (sent) => {
      uploadStore.update(item.id, { sent });
    },
    onAfterResponse: (_request, response) => {
      const stored = response.getHeader('X-Canopy-Path');
      if (stored) result = { path: stored, skipped: false };
      if (response.getHeader('X-Canopy-Result') === 'skipped')
        result = { path: null, skipped: true };
    },
    onSuccess: () => {
      finish(
        item.id,
        result.skipped
          ? { state: 'skipped' }
          : { state: 'done', storedAt: result.path, sent: item.size },
      );
    },
    onError: (error) => {
      const body = (error as DetailedError).originalResponse?.getBody();
      const code = refusalCode(body);
      if (code === 'files.exists') finish(item.id, { state: 'skipped' });
      else finish(item.id, { state: 'failed', errorCode: code ?? 'system.unexpected' });
    },
  });
}

/** Queues files for upload into a folder. Returns their ids. */
export function enqueueUploads(
  destination: string,
  files: readonly { file: File; relativeDir: string; strategy: UploadStrategy }[],
): string[] {
  const added: UploadItem[] = files.map(({ file, relativeDir }) => ({
    id: crypto.randomUUID(),
    name: file.name,
    destination,
    relativeDir,
    size: file.size,
    sent: 0,
    state: 'queued',
    storedAt: null,
    errorCode: null,
    startedAt: null,
    finishedAt: null,
  }));
  added.forEach((item, index) => {
    const picked = files[index];
    if (!picked) return;
    controls.set(item.id, create(item, picked.file, picked.strategy));
    waiting.push(item.id);
  });
  uploadStore.add(added);
  pump();
  return added.map((item) => item.id);
}

/** Stops a file; the partial upload is deleted on the engine. */
export function cancelUpload(id: string): void {
  const upload = controls.get(id);
  const queued = waiting.indexOf(id);
  if (queued >= 0) waiting.splice(queued, 1);
  controls.delete(id);
  uploadStore.update(id, { state: 'cancelled', finishedAt: Date.now() });
  void upload?.abort(true);
  pump();
}

/** Runs a failed file again: tus resumes from the bytes the engine already has. */
export function retryUpload(id: string): void {
  const item = uploadStore.get(id);
  if (item?.state !== 'failed' || !controls.has(id)) return;
  waiting.push(id);
  uploadStore.update(id, { state: 'queued', errorCode: null, finishedAt: null });
  pump();
}

/** Forgets finished files (the panel's dismiss and clear). */
export function dismissUploads(ids: ReadonlySet<string>): void {
  for (const id of ids) controls.delete(id);
  uploadStore.remove(ids);
}

/** Whether any file is still sending (warn before leaving the page). */
export function uploading(): boolean {
  return uploadStore.all().some(isActive);
}
