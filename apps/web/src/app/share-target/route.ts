import { NextResponse } from 'next/server';

/**
 * Files shared from the phone are kept by the service worker and never reach the server; this
 * only answers a share made before the worker took control, by opening the app.
 */
export function POST(request: Request) {
  return NextResponse.redirect(new URL('/', request.url), 303);
}
