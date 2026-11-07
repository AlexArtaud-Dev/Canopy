import type { Instrumentation } from 'next';

// Runs once when the server process starts, before any request is served. The positive
// NEXT_RUNTIME check (inlined at build time) keeps Node-only code out of the Edge bundle.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startNodeServer } = await import('./instrumentation-node');
    await startNodeServer();
  }
}

/**
 * Every uncaught server error lands here. The digest is the reference users see on the error
 * page, so logging it with the route lets an admin find the stack trace.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  // NEXT_RUNTIME is inlined at build time, so the Edge bundle never pulls in the Node logger.
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
  }
  const { logger } = await import('@/shared/lib/logger');
  const digest =
    typeof error === 'object' && error !== null && 'digest' in error
      ? String(error.digest)
      : undefined;
  logger.error('unhandled request error', {
    module: 'web',
    digest,
    method: request.method,
    path: request.path,
    routePath: context.routePath,
    routeType: context.routeType,
    error,
  });
};
