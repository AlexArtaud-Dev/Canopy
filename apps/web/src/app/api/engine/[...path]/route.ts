import { proxyToEngine } from '@/features/files/server/engine-proxy';

// Streams must never be cached or prerendered.
export const dynamic = 'force-dynamic';

export function GET(request: Request): Promise<Response> {
  return proxyToEngine(request);
}
