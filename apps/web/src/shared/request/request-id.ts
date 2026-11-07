const requestIdPattern = /^[\w-]{8,128}$/;

/**
 * Keeps a request ID supplied upstream (reverse proxy, load balancer) when it looks sane, so one
 * ID follows the request across systems; otherwise mints a new one. Edge- and Node-safe.
 */
export function resolveRequestId(incoming: string | null, generate: () => string): string {
  return incoming && requestIdPattern.test(incoming) ? incoming : generate();
}
