import { randomBytes } from 'node:crypto';

import { AppBaseError } from '@/shared/lib/errors';

import {
  createKeyring,
  decrypt,
  deriveSubkey,
  encrypt,
  encryptionErrorCodes,
  needsRotation,
  parseKey,
} from './envelope';

const keyA = randomBytes(32).toString('base64');
const keyB = randomBytes(32).toString('base64');
const ring = createKeyring(keyA);

function expectCode(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(AppBaseError);
    expect((error as AppBaseError).code).toBe(code);
    return;
  }
  throw new Error('expected an error');
}

describe('parseKey', () => {
  it('accepts a 32-byte base64 key and derives a stable id', () => {
    const parsed = parseKey(keyA);
    expect(parsed.key).toHaveLength(32);
    expect(parsed.id).toMatch(/^[0-9a-f]{8}$/);
    expect(parseKey(` ${keyA} `).id).toBe(parsed.id);
  });

  it.each(['', 'c2hvcnQ=', randomBytes(64).toString('base64')])('rejects %s', (encoded) => {
    expectCode(() => parseKey(encoded), encryptionErrorCodes.invalidKey);
  });
});

describe('encrypt / decrypt', () => {
  it('round-trips unicode with a random IV each time', () => {
    const first = encrypt('sécret ✓', 'auth.totp:u1', ring);
    const second = encrypt('sécret ✓', 'auth.totp:u1', ring);
    expect(first).not.toBe(second);
    expect(decrypt(first, 'auth.totp:u1', ring)).toBe('sécret ✓');
  });

  it('round-trips an empty string', () => {
    expect(decrypt(encrypt('', 'ctx', ring), 'ctx', ring)).toBe('');
  });

  it('refuses a value moved to another purpose (associated data mismatch)', () => {
    const sealed = encrypt('x', 'auth.totp:u1', ring);
    expectCode(() => decrypt(sealed, 'auth.totp:u2', ring), encryptionErrorCodes.undecryptable);
  });

  it('refuses tampered ciphertext', () => {
    const parts = encrypt('hello', 'ctx', ring).split('.');
    parts[4] = Buffer.from('jello').toString('base64url');
    expectCode(() => decrypt(parts.join('.'), 'ctx', ring), encryptionErrorCodes.undecryptable);
  });

  it.each(['', 'v2.a.b.c.d', 'v1.only.three', 'v1.a.b.c.d.e', 'v1..b.c.d'])(
    'refuses malformed envelope %s',
    (envelope) => {
      expectCode(() => decrypt(envelope, 'ctx', ring), encryptionErrorCodes.undecryptable);
    },
  );

  it('refuses a value sealed with an unknown key', () => {
    const sealed = encrypt('x', 'ctx', createKeyring(keyB));
    expectCode(() => decrypt(sealed, 'ctx', ring), encryptionErrorCodes.undecryptable);
  });
});

describe('rotation', () => {
  it('decrypts with a previous key and flags the value for re-encryption', () => {
    const old = encrypt('legacy', 'ctx', createKeyring(keyA));
    const rotated = createKeyring(keyB, [keyA, '']);
    expect(decrypt(old, 'ctx', rotated)).toBe('legacy');
    expect(needsRotation(old, rotated)).toBe(true);
    expect(needsRotation(encrypt('fresh', 'ctx', rotated), rotated)).toBe(false);
  });
});

describe('deriveSubkey', () => {
  const keyring = createKeyring(randomBytes(32).toString('base64'));

  it('is stable for one purpose and distinct across purposes', () => {
    const first = deriveSubkey(keyring, 'canopy.auth');
    expect(first).toHaveLength(32);
    expect(deriveSubkey(keyring, 'canopy.auth').equals(first)).toBe(true);
    expect(deriveSubkey(keyring, 'other').equals(first)).toBe(false);
    expect(first.equals(keyring.current.key)).toBe(false);
  });
});
