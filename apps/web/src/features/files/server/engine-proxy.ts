import 'server-only';

import { randomUUID } from 'node:crypto';

import { parseServerEnv } from '@/shared/config/env';
import { signEngineToken } from '@/shared/engine/engine-token';
import { logger } from '@/shared/lib/logger';
import { isMaintenanceOn } from '@/shared/maintenance/maintenance-state';
import { isLocalRequest } from '@/shared/request/local-request';
import { resolveRequestId } from '@/shared/request/request-id';
import { loadGroupIds } from '@/features/access/server/permissions';
import { resolveSession } from '@/features/auth/server/current-session';

import { engineRouteFor, forwardableHeaders } from '../engine-routes.utils';

const log = logger.child({ module: 'engine-proxy' });

/** Event streams end after this long; EventSource reconnects and the session is checked again. */
const streamLifetimeMs = 10 * 60 * 1000;

function fail(status: number, code: string, requestId: string): Response {
  return Response.json(
    { code, params: {}, requestId },
    { status, headers: { 'cache-control': 'no-store' } },
  );
}

/**
 * Passes an allowed engine route (GET event streams today) to the browser. The engine token is
 * signed here and never reaches the browser. `/api/engine/*` is outside the proxy matcher, so this
 * checks maintenance and the session itself. Request bodies (uploads) must not come through an
 * App Router handler (docs/dev/streaming.md): routes with a body are not allowed here.
 */
export async function proxyToEngine(request: Request): Promise<Response> {
  const requestId = resolveRequestId(request.headers.get('x-request-id'), randomUUID);
  const url = new URL(request.url);
  const route = engineRouteFor(request.method, url.pathname + url.search);
  if (!route) return fail(404, 'system.not_found', requestId);
  if ((await isMaintenanceOn()) && !isLocalRequest(request.headers)) {
    return fail(503, 'system.maintenance', requestId);
  }
  const { state } = await resolveSession(request.headers);
  if (state.kind !== 'active' || state.user.twoFactorSetupRequired) {
    return fail(401, 'auth.signed_out', requestId);
  }

  const token = await signEngineToken({
    userId: state.user.id,
    sessionId: state.sessionId,
    permissions: state.user.permissions,
    groups: await loadGroupIds(state.user.id),
  });
  // Aborts when the browser leaves, or when a stream reaches its lifetime.
  const abort = new AbortController();
  request.signal.addEventListener('abort', () => {
    abort.abort();
  });
  let upstream: Response;
  try {
    upstream = await fetch(new URL(route.target, parseServerEnv(process.env).CANOPY_ENGINE_URL), {
      method: request.method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: request.headers.get('accept') ?? '*/*',
        'x-request-id': requestId,
      },
      signal: abort.signal,
    });
  } catch (error) {
    log.warn('engine unreachable', { requestId, error });
    return fail(502, 'system.engine_unavailable', requestId);
  }
  if (route.stream) {
    const timer = setTimeout(() => {
      abort.abort();
    }, streamLifetimeMs);
    abort.signal.addEventListener('abort', () => {
      clearTimeout(timer);
    });
  }
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      ...forwardableHeaders(Object.fromEntries(upstream.headers)),
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
    },
  });
}
