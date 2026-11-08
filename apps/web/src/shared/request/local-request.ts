import { parseServerEnv } from '@/shared/config/env';

import {
  isInNetworks,
  parseTrustedNetworks,
  readPeerHeader,
  resolveClientIp,
  type TrustedNetworks,
} from './client-ip';

let networks: { trusted: TrustedNetworks; local: TrustedNetworks } | undefined;

function getNetworks() {
  if (!networks) {
    const env = parseServerEnv(process.env);
    networks = {
      trusted: parseTrustedNetworks(env.CANOPY_TRUSTED_PROXIES),
      local: parseTrustedNetworks(env.CANOPY_LOCAL_NETWORKS),
    };
  }
  return networks;
}

/** Whether a request comes from the local network (same resolution as `getRequestContext`). */
export function isLocalRequest(headers: { get: (name: string) => string | null }): boolean {
  const { trusted, local } = getNetworks();
  const ip = resolveClientIp({
    peer: readPeerHeader(headers.get('x-canopy-peer'), process.env.CANOPY_PEER_NONCE),
    forwardedFor: headers.get('x-forwarded-for'),
    cfConnectingIp: headers.get('cf-connecting-ip'),
    trusted,
  });
  return ip !== undefined && isInNetworks(ip, local);
}
