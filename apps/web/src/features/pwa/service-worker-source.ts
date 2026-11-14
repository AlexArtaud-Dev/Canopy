import { linkedStylesheets } from './pwa.utils';

/** Bumped when the worker changes what it keeps: older caches are dropped on activation. */
export const offlineCacheName = 'canopy-offline-v1';

/** The page shown when a navigation finds no server; public and kept by the worker. */
export const offlinePath = '/offline';

/**
 * The service worker, served at `/sw.js` so that it controls the whole app. It keeps one page:
 * when a navigation fails (server down, no network), the offline page answers instead of the
 * browser's error. Nothing else is cached: files, previews and API calls always go to the server.
 */
export function serviceWorkerSource(): string {
  return `'use strict';
const CACHE = ${JSON.stringify(offlineCacheName)};
const OFFLINE = ${JSON.stringify(offlinePath)};
const linkedStylesheets = ${linkedStylesheets.toString()};

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
