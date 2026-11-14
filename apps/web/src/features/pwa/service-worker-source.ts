import {
  linkedStylesheets,
  sharedFileKey,
  sharedFileNameHeader,
  sharedFilesCacheName,
  shareTargetPath,
} from './pwa.utils';

/** Bumped when the worker changes what it keeps: older caches are dropped on activation. */
export const offlineCacheName = 'canopy-offline-v1';

/** The page shown when a navigation finds no server; public and kept by the worker. */
export const offlinePath = '/offline';

/**
 * The service worker, served at `/sw.js` so that it controls the whole app. It keeps one page:
 * when a navigation fails (server down, no network), the offline page answers instead of the
 * browser's error. Nothing else is cached: files, previews and API calls always go to the server.
 *
 * Files shared from the phone (share sheet → Canopy) are posted to it, never to the server: it
 * keeps them in the browser and opens the file browser, where the person picks the folder and
 * uploads them like any upload (rights, resume, audit).
 */
export function serviceWorkerSource(): string {
  return `'use strict';
const CACHE = ${JSON.stringify(offlineCacheName)};
const OFFLINE = ${JSON.stringify(offlinePath)};
const SHARED = ${JSON.stringify(sharedFilesCacheName)};
const SHARE_TARGET = ${JSON.stringify(shareTargetPath)};
const NAME_HEADER = ${JSON.stringify(sharedFileNameHeader)};
const linkedStylesheets = ${linkedStylesheets.toString()};
const sharedFileKey = ${sharedFileKey.toString()};

async function keepSharedFiles(request) {
  const form = await request.formData();
  await caches.delete(SHARED);
  const cache = await caches.open(SHARED);
  const files = form.getAll('files').filter((value) => typeof value !== 'string');
  await Promise.all(
    files.map((file, index) =>
      cache.put(
        sharedFileKey(index),
        new Response(file, {
          headers: {
            'Content-Type': file.type || 'application/octet-stream',
            [NAME_HEADER]: encodeURIComponent(file.name),
          },
        }),
      ),
    ),
  );
  return Response.redirect('/', 303);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const response = await fetch(OFFLINE, { cache: 'reload', credentials: 'same-origin' });
      if (response.ok) {
        const html = await response.clone().text();
        await cache.put(OFFLINE, response);
        await cache.addAll(linkedStylesheets(html));
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method === 'POST' && new URL(request.url).pathname === SHARE_TARGET) {
    event.respondWith(keepSharedFiles(request));
    return;
  }
  if (request.method === 'GET' && request.url.startsWith(self.location.origin)) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/_next/static/') && url.pathname.endsWith('.css')) {
      event.respondWith(fetch(request).catch(async () => (await caches.match(request)) || Response.error()));
      return;
    }
  }
  if (request.mode !== 'navigate') return;
  event.respondWith(
    fetch(request).catch(async () => (await caches.match(OFFLINE)) || Response.error()),
  );
});
`;
}
