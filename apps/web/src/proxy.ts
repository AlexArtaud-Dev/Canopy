import { NextResponse, type NextRequest } from 'next/server';

import { parseServerEnv } from '@/shared/config/env';
import { isMaintenanceOn } from '@/shared/maintenance/maintenance-state';
import { maintenanceDecision } from '@/shared/maintenance/maintenance.utils';
import {
  isInNetworks,
  parseTrustedNetworks,
  readPeerHeader,
  resolveClientIp,
  type TrustedNetworks,
} from '@/shared/request/client-ip';
import { resolveRequestId } from '@/shared/request/request-id';
import { buildContentSecurityPolicy } from '@/shared/security/csp';

const publicPaths = ['/login', '/setup', '/forgot-password', '/set-password', '/maintenance'];
const sessionCookies = ['canopy.session_token', '__Secure-canopy.session_token'];

function isPublic(pathname: string): boolean {
  return publicPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

let networks: { trusted: TrustedNetworks; local: TrustedNetworks } | undefined;

function getNetworks() {
  if (!networks) {
    const env = parseServerEnv(process.env);
    networks = {
      trusted: parseTrustedNetworks(env.CANOPY_TRUSTED_PROXIES),
      local: parseTrustedNetworks(env.CANOPY_LOCAL_NETWORKS),
    };
  }
  return networks;
}

/** Same resolution as `getRequestContext`, before any page code runs. */
function isLocal(request: NextRequest): boolean {
  const { trusted, local } = getNetworks();
  const ip = resolveClientIp({
    peer: readPeerHeader(request.headers.get('x-canopy-peer'), process.env.CANOPY_PEER_NONCE),
    forwardedFor: request.headers.get('x-forwarded-for'),
    cfConnectingIp: request.headers.get('cf-connecting-ip'),
    trusted,
  });
  return ip !== undefined && isInNetworks(ip, local);
}

// Next.js 16 "proxy" (formerly middleware). Keep it cheap: it runs before every matched request.
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;
  const decision = maintenanceDecision({
    enabled: await isMaintenanceOn(),
    local: isLocal(request),
    pathname,
  });
  if (decision === 'unavailable') {
    return NextResponse.json(
      { code: 'system.maintenance', params: {}, requestId: '' },
      { status: 503, headers: { 'Retry-After': '300' } },
    );
  }
  if (decision === 'page') {
    return NextResponse.rewrite(new URL('/maintenance', request.url), { status: 503 });
  }
  // Optimistic only (no DB): saves a render for obvious visitors. Pages and actions still verify
  // the session with `requireSession()`.
  const hasSessionCookie = sessionCookies.some((name) => request.cookies.has(name));
  if (!hasSessionCookie && !isPublic(pathname) && request.method === 'GET') {
    const login = new URL('/login', request.url);
    if (pathname !== '/') login.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const policy = buildContentSecurityPolicy(nonce, process.env.NODE_ENV === 'development');

  // Next reads the CSP from the request to put the nonce on its own scripts; pages read `x-nonce`.
  const requestId = resolveRequestId(request.headers.get('x-request-id'), () =>
    crypto.randomUUID(),
  );

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-request-id', requestId);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', policy);
  // Lets users and admins correlate a page with server logs.
  response.headers.set('X-Request-Id', requestId);
  return response;
}

export const config = {
  matcher: [
    {
      /*
       * Skip streaming and asset routes. `/engine/*` and `/api/engine/*` MUST stay excluded: a
       * matched request has its body cloned and buffered (10 MiB cap), which breaks uploads.
       * See docs/dev/streaming.md.
       */
      source: '/((?!engine|api/engine|api/health|_next/static|_next/image|favicon.ico|icon.svg).*)',
      missing: [{ type: 'header', key: 'next-router-prefetch' }],
    },
  ],
};
