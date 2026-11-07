// Spike variant B: a streaming Route Handler proxy (never merged).
import { parseServerEnv } from '@/shared/config/env';

export const dynamic = 'force-dynamic';

const hopByHop = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
]);

function forwardHeaders(source: Headers): Headers {
  const result = new Headers();
  source.forEach((value, key) => {
    if (!hopByHop.has(key)) result.set(key, value);
  });
  return result;
}

async function proxy(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const { CANOPY_ENGINE_URL } = parseServerEnv(process.env);
  const target = new URL(`/${path.join('/')}${new URL(request.url).search}`, CANOPY_ENGINE_URL);

  const upstream = await fetch(target, {
    method: request.method,
    headers: forwardHeaders(request.headers),
    body: request.body,
    signal: request.signal,
    // @ts-expect-error -- `duplex` is required by undici for streamed request bodies.
    duplex: 'half',
    cache: 'no-store',
    redirect: 'manual',
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: forwardHeaders(upstream.headers),
  });
}

export { proxy as GET, proxy as PUT, proxy as POST };
