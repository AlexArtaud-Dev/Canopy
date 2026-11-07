import 'server-only';

import { randomUUID } from 'node:crypto';

import { headers } from 'next/headers';
import { cache } from 'react';

import { parseServerEnv } from '@/shared/config/env';
import { logger, type Logger } from '@/shared/lib/logger';

import { parseTrustedNetworks, readPeerHeader, resolveClientIp } from './client-ip';
import { resolveRequestId } from './request-id';

export interface RequestContext {
  requestId: string;
  /** Undefined when the peer could not be established: treat as untrusted and non-local. */
  clientIp: string | undefined;
  logger: Logger;
}

let trustedNetworks: ReturnType<typeof parseTrustedNetworks> | undefined;

function getTrustedNetworks() {
  trustedNetworks ??= parseTrustedNetworks(parseServerEnv(process.env).CANOPY_TRUSTED_PROXIES);
  return trustedNetworks;
}

/** Per-request context, memoized for the duration of one server render or action. */
export const getRequestContext = cache(async (): Promise<RequestContext> => {
  const headerStore = await headers();
  // proxy.ts already resolved it for pages and actions; this covers routes it skips.
  const requestId = resolveRequestId(headerStore.get('x-request-id'), randomUUID);

  const clientIp = resolveClientIp({
    peer: readPeerHeader(headerStore.get('x-canopy-peer'), process.env.CANOPY_PEER_NONCE),
    forwardedFor: headerStore.get('x-forwarded-for'),
    cfConnectingIp: headerStore.get('cf-connecting-ip'),
    trusted: getTrustedNetworks(),
  });

  return { requestId, clientIp, logger: logger.child({ requestId, clientIp }) };
});
