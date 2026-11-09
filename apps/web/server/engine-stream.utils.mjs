// Pure helpers of the stream relay (engine-stream.mjs). Plain JavaScript: preloaded with
// `node --import` before Next starts, so TypeScript modules are out of reach.

export const streamPrefix = '/api/engine/stream';
export const ticketCookie = 'canopy_stream';

/** Engine routes the browser may reach through the relay, by method. Everything else is a 404. */
const routes = [
  { methods: ['GET', 'HEAD'], path: /^\/v1\/fs\/(?:download|preview)$/ },
  { methods: ['GET'], path: /^\/v1\/fs\/(?:archive|thumbnail)$/ },
  // tus: create an upload, then resume (HEAD), send bytes (PATCH) or cancel (DELETE) it.
  { methods: ['POST'], path: /^\/v1\/uploads\/$/ },
  // Upload ids: 32 random hex characters, then the volume name in hex (engine's uploads.NewID).
  {
    methods: ['HEAD', 'PATCH', 'DELETE'],
    path: /^\/v1\/uploads\/[0-9a-f]{32}(?:[0-9a-f]{2}){0,255}$/,
  },
];

/** Engine path and query for a relayed URL, or null when the route is not allowed. */
export function relayTarget(method, url) {
  if (!method || !url || !url.startsWith(`${streamPrefix}/`)) return null;
  const parsed = new URL(url, 'http://canopy.invalid');
  const path = parsed.pathname.slice(streamPrefix.length);
  if (path.includes('..') || path.includes('//')) return null;
  const allowed = routes.some((route) => route.methods.includes(method) && route.path.test(path));
  return allowed ? path + parsed.search : null;
}

/** One cookie's value from a Cookie header. */
export function readCookie(header, name) {
  if (!header) return null;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator > 0 && part.slice(0, separator).trim() === name) {
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  }
  return null;
}

const requestHeaders = [
  'accept',
  'range',
  'if-range',
  'if-modified-since',
  'if-none-match',
  'content-type',
  'content-length',
  'tus-resumable',
  'upload-length',
  'upload-offset',
  'upload-metadata',
  'upload-defer-length',
];
const responseHeaders = [
  'content-type',
  'content-length',
  'content-range',
  'content-disposition',
  'accept-ranges',
  'last-modified',
  'etag',
  'x-content-type-options',
  // Previews: the engine's sandbox for anything the browser could interpret.
  'content-security-policy',
  'cache-control',
  'tus-resumable',
  'tus-version',
  'tus-extension',
  'tus-max-size',
  'upload-offset',
  'upload-length',
  'upload-expires',
  'x-canopy-path',
  'x-canopy-result',
];

function pick(headers, names) {
  const picked = {};
  for (const name of names) {
    const value = headers[name];
    if (typeof value === 'string') picked[name] = value;
  }
  return picked;
}

/** Headers sent to the engine: the ticket as a bearer token, never the browser's cookies. */
export function upstreamHeaders(incoming, ticket, requestId) {
  return {
    ...pick(incoming, requestHeaders),
    authorization: `Bearer ${ticket}`,
    'x-request-id': requestId,
  };
}

/** Headers returned to the browser: content, range and upload metadata only. */
export function downstreamHeaders(engine) {
  const headers = { ...pick(engine, responseHeaders), 'x-accel-buffering': 'no' };
  const location = relayLocation(engine.location);
  if (location) headers.location = location;
  return headers;
}

/** tus answers with the engine's own URL for a new upload; the browser must use the relay. */
export function relayLocation(location) {
  if (typeof location !== 'string') return null;
  const path = new URL(location, 'http://canopy.invalid').pathname;
  return path.startsWith('/v1/uploads/') ? streamPrefix + path : null;
}

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Writes must come from this origin. SameSite=Strict already keeps the ticket cookie off
 * cross-site requests; this refuses them even if a browser got that wrong.
 */
export function sameOrigin(method, origin, host) {
  if (safeMethods.has(method ?? '')) return true;
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
