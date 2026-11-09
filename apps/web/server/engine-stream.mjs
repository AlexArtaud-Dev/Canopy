// Preloaded with `node --import` before Next starts. Relays `/api/engine/stream/*` (downloads
// now, uploads next) straight to the engine with Node streams, so a 10 GB transfer never sits in
// the web process: Next.js never sees these requests (docs/dev/streaming.md).
//
// Authentication is the stream ticket, an HttpOnly cookie set by a server action just before the
// transfer. The engine verifies it and only accepts it on streaming routes; this relay only checks
// that the route is allowed and that the request comes from this origin.
import { randomUUID } from 'node:crypto';
import { request as httpRequest, Server } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { pipeline } from 'node:stream';

import {
  downstreamHeaders,
  readCookie,
  relayTarget,
  sameOrigin,
  streamPrefix,
  ticketCookie,
  upstreamHeaders,
} from './engine-stream.utils.mjs';

const engineUrl = new URL(process.env.CANOPY_ENGINE_URL ?? 'http://localhost:8080');
const send = engineUrl.protocol === 'https:' ? httpsRequest : httpRequest;

function fail(response, status, code, requestId) {
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  response.end(JSON.stringify({ code, params: {}, requestId }));
}

/** Handles a request when it is for the relay; returns false to let Next handle it. */
function relay(request, response) {
  if (!request.url?.startsWith(`${streamPrefix}/`)) return false;
  const requestId = randomUUID();
  const target = relayTarget(request.method, request.url);
  if (!target) {
    fail(response, 404, 'system.not_found', requestId);
    return true;
  }
  if (!sameOrigin(request.method, request.headers.origin, request.headers.host)) {
    fail(response, 403, 'auth.forbidden', requestId);
    return true;
  }
  const ticket = readCookie(request.headers.cookie, ticketCookie);
  if (!ticket) {
    fail(response, 401, 'auth.signed_out', requestId);
    return true;
  }
  const upstream = send(new URL(target, engineUrl), {
    method: request.method,
    headers: upstreamHeaders(request.headers, ticket, requestId),
  });
  upstream.on('response', (engine) => {
    response.writeHead(engine.statusCode ?? 502, downstreamHeaders(engine.headers));
    pipeline(engine, response, () => {
      // Either side closed: pipeline tears both down.
    });
  });
  upstream.on('error', () => {
    if (response.headersSent) response.destroy();
    else fail(response, 502, 'system.engine_unavailable', requestId);
  });
  response.on('close', () => {
    upstream.destroy();
  });
  pipeline(request, upstream, () => {
    // Request bodies (uploads) flow with backpressure; failures surface on upstream.
  });
  return true;
}

const emit = Server.prototype.emit;
Server.prototype.emit = function emitWithRelay(event, ...args) {
  if (event === 'request' && relay(args[0], args[1])) return true;
  return emit.call(this, event, ...args);
};
