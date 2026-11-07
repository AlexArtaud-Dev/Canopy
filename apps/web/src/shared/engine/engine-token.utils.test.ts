/**
 * @jest-environment node
 */
import { createPrivateKey, createPublicKey, generateKeyPairSync } from 'node:crypto';

import {
  engineTokenAudience,
  engineTokenIssuer,
  engineTokenLifetimeSeconds,
  pkcs8FromSeed,
} from './engine-token.utils';

describe('pkcs8FromSeed', () => {
  it('rebuilds the same Ed25519 key from its raw seed', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const seed = privateKey.export({ format: 'jwk' }).d ?? '';
    const imported = createPrivateKey({ key: pkcs8FromSeed(seed), format: 'der', type: 'pkcs8' });
    expect(createPublicKey(imported).export({ format: 'jwk' }).x).toBe(
      publicKey.export({ format: 'jwk' }).x,
    );
  });

  it('rejects keys of the wrong size', () => {
    expect(() => pkcs8FromSeed('c2hvcnQ')).toThrow('want 32 bytes');
  });

  it('matches the claims the engine expects', () => {
    expect([engineTokenIssuer, engineTokenAudience]).toEqual(['canopy-web', 'canopy-engine']);
    expect(engineTokenLifetimeSeconds).toBeLessThanOrEqual(300);
  });
});
