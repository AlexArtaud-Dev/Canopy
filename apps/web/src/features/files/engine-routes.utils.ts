/**
 * What the browser may reach on the engine through `/api/engine/*`. Everything else is refused
 * before any session lookup: the proxy is not a general gateway, each streaming use is listed.
 */
const routes: readonly { method: string; path: RegExp; stream: boolean }[] = [
  { method: 'GET', path: /^\/v1\/jobs\/events$/, stream: true },
];

export interface EngineRoute {
  /** Engine path with the query string, e.g. `/v1/jobs/events`. */
  target: string;
  /** Long-lived event stream: closed after a while so the browser reconnects and re-authenticates. */
  stream: boolean;
}

/** Maps `/api/engine/<path>?<query>` to the engine, or null when it is not allowed. */
export function engineRouteFor(
  method: string | undefined,
  url: string | undefined,
): EngineRoute | null {
  if (!method || !url?.startsWith('/api/engine/')) return null;
  const parsed = new URL(url, 'http://canopy.invalid');
  const path = parsed.pathname.slice('/api/engine'.length);
  if (path.includes('..') || path.includes('//')) return null;
  const route = routes.find(
    (candidate) => candidate.method === method && candidate.path.test(path),
  );
  return route ? { target: path + parsed.search, stream: route.stream } : null;
}

/** Response headers passed from the engine to the browser (never hop-by-hop or cookies). */
const forwardedHeaders = new Set([
  'content-type',
  'content-length',
  'content-range',
  'accept-ranges',
  'last-modified',
  'etag',
  'content-disposition',
]);

export function forwardableHeaders(
  headers: Readonly<Record<string, string | string[] | undefined>>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (typeof value === 'string' && forwardedHeaders.has(name.toLowerCase()))
      result[name.toLowerCase()] = value;
  }
  return result;
}
