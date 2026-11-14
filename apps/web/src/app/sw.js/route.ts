import { serviceWorkerSource } from '@/features/pwa/service-worker-source';

export const dynamic = 'force-static';

/** The service worker, at the root so that its scope is the whole app. */
export function GET() {
  return new Response(serviceWorkerSource(), {
    headers: {
      'Content-Type': 'text/javascript; charset=utf-8',
      // Browsers check for a new worker on each visit; never serve them a stale one.
      'Cache-Control': 'no-cache',
    },
  });
}
