import { BlockList, isIP } from 'node:net';

export type TrustedNetworks = BlockList;

/** Strips the IPv4-mapped IPv6 prefix so `::ffff:10.0.0.1` matches IPv4 rules. */
export function normalizeIp(value: string): string | undefined {
  const trimmed = value.trim().replace(/^\[|\]$/g, '');
  const unmapped = trimmed.toLowerCase().startsWith('::ffff:') ? trimmed.slice(7) : trimmed;
  return isIP(unmapped) === 0 ? undefined : unmapped;
}

/**
 * Parses a comma-separated CIDR list (`10.0.0.0/8, 172.16.0.0/12, ::1/128`); single addresses are
 * accepted as /32 or /128. Throws on malformed input so a typo never silently trusts nothing.
 */
export function parseTrustedNetworks(csv: string): TrustedNetworks {
  const list = new BlockList();
  for (const entry of csv
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)) {
    const slash = entry.indexOf('/');
    const address = slash === -1 ? entry : entry.slice(0, slash);
    const prefixText = slash === -1 ? undefined : entry.slice(slash + 1);
    const ip = normalizeIp(address);
    if (!ip) {
      throw new Error(`invalid network: ${entry}`);
    }
    const family = isIP(ip) === 4 ? 'ipv4' : 'ipv6';
    const maxPrefix = family === 'ipv4' ? 32 : 128;
    const prefix = prefixText === undefined ? maxPrefix : Number(prefixText);
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > maxPrefix) {
      throw new Error(`invalid prefix: ${entry}`);
    }
    list.addSubnet(ip, prefix, family);
  }
  return list;
}

export function isInNetworks(ip: string, networks: TrustedNetworks): boolean {
  return networks.check(ip, isIP(ip) === 4 ? 'ipv4' : 'ipv6');
}

interface ClientIpInput {
  /** Direct TCP peer, or undefined when it could not be established. */
  peer: string | undefined;
  forwardedFor: string | null;
  cfConnectingIp: string | null;
  trusted: TrustedNetworks;
}

/**
 * Real client IP. Forwarded headers count only when the direct peer is a trusted proxy; then
 * `CF-Connecting-IP` wins, else X-Forwarded-For is walked right to left skipping trusted hops.
 * Returns undefined when the peer is unknown, so callers fail closed.
 */
export function resolveClientIp({
  peer,
  forwardedFor,
  cfConnectingIp,
  trusted,
}: ClientIpInput): string | undefined {
  const peerIp = peer === undefined ? undefined : normalizeIp(peer);
  if (!peerIp || !isInNetworks(peerIp, trusted)) {
    return peerIp;
  }

  const cloudflare = cfConnectingIp ? normalizeIp(cfConnectingIp) : undefined;
  if (cloudflare) {
    return cloudflare;
  }

  const hops = (forwardedFor ?? '')
    .split(',')
    .map(normalizeIp)
    .filter((ip) => ip !== undefined);
  for (let index = hops.length - 1; index >= 0; index -= 1) {
    const hop = hops[index];
    if (hop !== undefined && !isInNetworks(hop, trusted)) {
      return hop;
    }
  }
  // Every hop is trusted: the request originates from the proxy chain itself.
  return hops[0] ?? peerIp;
}

/** Reads the peer recorded by `server/peer-address.mjs`; ignores values without our nonce. */
export function readPeerHeader(
  header: string | null,
  nonce: string | undefined,
): string | undefined {
  if (!header || !nonce) {
    return undefined;
  }
  const [headerNonce, address] = header.split(' ');
  return headerNonce === nonce && address ? address : undefined;
}
