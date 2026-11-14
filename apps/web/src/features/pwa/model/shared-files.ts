'use client';

import { useEffect, useState } from 'react';

import { sharedFileIndex, sharedFileNameHeader, sharedFilesCacheName } from '../pwa.utils';

/** The files shared from the phone and kept by the service worker, in the order they came. */
async function readSharedFiles(): Promise<File[]> {
  if (!('caches' in window) || !(await caches.has(sharedFilesCacheName))) return [];
  const cache = await caches.open(sharedFilesCacheName);
  const requests = (await cache.keys())
    .map((request) => ({ request, index: sharedFileIndex(request.url) }))
    .filter(({ index }) => index >= 0)
    .sort((a, b) => a.index - b.index);
  const files = await Promise.all(
    requests.map(async ({ request, index }) => {
      const response = await cache.match(request);
      if (!response) return null;
      const encoded = response.headers.get(sharedFileNameHeader);
      const name = encoded ? decodeURIComponent(encoded) : `shared-${index + 1}`;
      const blob = await response.blob();
      return new File([blob], name, { type: blob.type });
    }),
  );
  return files.filter((file) => file !== null);
}

/**
 * Files waiting to be put in a folder after a share from the phone; `clear` forgets them (once
 * uploaded, or when the person declines). They wait across folders until then.
 */
export function useSharedFiles(): { files: readonly File[]; clear: () => void } {
  const [files, setFiles] = useState<readonly File[]>([]);
  useEffect(() => {
    let current = true;
    void readSharedFiles()
      .then((found) => {
        if (current) setFiles(found);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, []);
  return {
    files,
    clear: () => {
      setFiles([]);
      if ('caches' in window) void caches.delete(sharedFilesCacheName);
    },
  };
}
