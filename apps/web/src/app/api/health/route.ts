export const dynamic = 'force-dynamic';

/** Liveness of the web process only; dependency readiness is reported on the system page. */
export function GET(): Response {
  return Response.json({ status: 'ok' });
}
