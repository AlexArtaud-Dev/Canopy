// Pure helpers of the stream relay (engine-stream.mjs). Plain JavaScript: preloaded with
// `node --import` before Next starts, so TypeScript modules are out of reach.

export const streamPrefix = '/api/engine/stream';
export const ticketCookie = 'canopy_stream';

/** Engine routes the browser may reach through the relay, by method. Everything else is a 404. */
const routes = [
  { methods: ['GET', 'HEAD'], path: /^\/v1\/fs\/download$/ },
  { methods: ['GET'], path: /^\/v1\/fs\/archive$/ },
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

const requestHeaders = ['accept', 'range', 'if-range', 'if-modified-since', 'if-none-match'];
const responseHeaders = [
  'content-type',
  'content-length',
  'content-range',
  'content-disposition',
  'accept-ranges',
  'last-modified',
  'etag',
  'x-content-type-options',
  'cache-control',
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

/** Headers returned to the browser: content and range metadata only. */
export function downstreamHeaders(engine) {
  return { ...pick(engine, responseHeaders), 'x-accel-buffering': 'no' };
}
