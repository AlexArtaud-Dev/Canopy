import {
  isInNetworks,
  normalizeIp,
  parseTrustedNetworks,
  readPeerHeader,
  resolveClientIp,
} from './client-ip';

const trusted = parseTrustedNetworks('10.0.0.0/8, 172.16.0.0/12, ::1, 2001:db8::/32');
const none = parseTrustedNetworks('');

describe('normalizeIp', () => {
  it.each([
    ['203.0.113.7', '203.0.113.7'],
    [' ::ffff:10.1.2.3 ', '10.1.2.3'],
    ['[2001:db8::1]', '2001:db8::1'],
    ['not-an-ip', undefined],
    ['', undefined],
  ])('%s → %s', (input, expected) => {
    expect(normalizeIp(input)).toBe(expected);
  });
});

describe('parseTrustedNetworks', () => {
  it('matches IPv4 and IPv6 subnets and single addresses', () => {
    expect(isInNetworks('10.20.30.40', trusted)).toBe(true);
    expect(isInNetworks('172.31.255.1', trusted)).toBe(true);
    expect(isInNetworks('172.32.0.1', trusted)).toBe(false);
    expect(isInNetworks('::1', trusted)).toBe(true);
    expect(isInNetworks('2001:db8:abcd::5', trusted)).toBe(true);
    expect(isInNetworks('2001:db9::5', trusted)).toBe(false);
  });

  it('trusts nothing for an empty list', () => {
    expect(isInNetworks('127.0.0.1', none)).toBe(false);
  });

  it.each(['10.0.0.0/33', '::/129', 'example.com', '10.0.0.0/x'])('rejects %s', (entry) => {
    expect(() => parseTrustedNetworks(entry)).toThrow();
  });
});

describe('resolveClientIp', () => {
  const base = { forwardedFor: null, cfConnectingIp: null, trusted };

  it('returns the peer when it is not a trusted proxy, ignoring forged headers', () => {
    expect(
      resolveClientIp({
        ...base,
        peer: '203.0.113.9',
        forwardedFor: '127.0.0.1',
        cfConnectingIp: '127.0.0.1',
      }),
    ).toBe('203.0.113.9');
  });

  it('fails closed when the peer is unknown', () => {
    expect(resolveClientIp({ ...base, peer: undefined, forwardedFor: '1.2.3.4' })).toBeUndefined();
    expect(resolveClientIp({ ...base, peer: 'garbage' })).toBeUndefined();
  });

  it('prefers CF-Connecting-IP behind a trusted proxy', () => {
    expect(
      resolveClientIp({
        ...base,
        peer: '10.0.0.2',
        forwardedFor: '198.51.100.1, 10.0.0.3',
        cfConnectingIp: '203.0.113.50',
      }),
    ).toBe('203.0.113.50');
  });

  it('walks X-Forwarded-For right to left, skipping trusted hops and garbage', () => {
    expect(
      resolveClientIp({
        ...base,
        peer: '::ffff:10.0.0.2',
        forwardedFor: '1.1.1.1, 198.51.100.7, bogus, 172.16.0.9',
      }),
    ).toBe('198.51.100.7');
  });

  it('returns the left-most hop when every hop is trusted', () => {
    expect(
      resolveClientIp({ ...base, peer: '10.0.0.2', forwardedFor: '10.9.9.9, 172.16.0.1' }),
    ).toBe('10.9.9.9');
  });

  it('returns the peer when a trusted proxy sends no forwarding header', () => {
    expect(resolveClientIp({ ...base, peer: '10.0.0.2', cfConnectingIp: 'nope' })).toBe('10.0.0.2');
  });
});

describe('readPeerHeader', () => {
  it('accepts only values stamped with the process nonce', () => {
    expect(readPeerHeader('abc 10.0.0.1', 'abc')).toBe('10.0.0.1');
    expect(readPeerHeader('forged 10.0.0.1', 'abc')).toBeUndefined();
    expect(readPeerHeader('abc', 'abc')).toBeUndefined();
    expect(readPeerHeader(null, 'abc')).toBeUndefined();
    expect(readPeerHeader('abc 10.0.0.1', undefined)).toBeUndefined();
  });
});
