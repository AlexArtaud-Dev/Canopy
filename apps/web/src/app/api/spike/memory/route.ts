// Spike only: exposes the Next server's memory so the harness can watch for buffering.
export const dynamic = 'force-dynamic';

export function GET(): Response {
  const { rss, heapUsed, external, arrayBuffers } = process.memoryUsage();
  return Response.json({ rss, heapUsed, external, arrayBuffers });
}
