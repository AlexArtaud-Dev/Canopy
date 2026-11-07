import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

import { AppBaseError } from '@/shared/lib/errors';

/**
 * AES-256-GCM envelope: `v1.<keyId>.<iv>.<tag>.<ciphertext>` (base64url). The key id lets old
 * values be decrypted after a rotation; the associated data binds a ciphertext to its purpose
 * (e.g. `auth.totp:<userId>`), so a value copied to another row or column fails to decrypt.
 */
const version = 'v1';
const algorithm = 'aes-256-gcm';
const keyBytes = 32;
const ivBytes = 12;

export interface EncryptionKey {
  id: string;
  key: Buffer;
}

export interface Keyring {
  current: EncryptionKey;
  /** Retired keys kept only to decrypt values not yet re-encrypted. */
  previous: readonly EncryptionKey[];
}

export const encryptionErrorCodes = {
  invalidKey: 'system.encryption_key_invalid',
  undecryptable: 'system.secret_undecryptable',
} as const;

function keyId(key: Buffer): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 8);
}

/** Parses a base64 (or base64url) 32-byte key, as produced by `openssl rand -base64 32`. */
export function parseKey(encoded: string): EncryptionKey {
  const key = Buffer.from(encoded.trim(), 'base64');
  if (key.length !== keyBytes) {
    throw new AppBaseError(
      encryptionErrorCodes.invalidKey,
      `encryption key must be ${String(keyBytes)} bytes`,
    );
  }
  return { id: keyId(key), key };
}

export function createKeyring(current: string, previous: readonly string[] = []): Keyring {
  return { current: parseKey(current), previous: previous.filter(Boolean).map(parseKey) };
}

export function encrypt(plaintext: string, associatedData: string, keyring: Keyring): string {
  const iv = randomBytes(ivBytes);
  const cipher = createCipheriv(algorithm, keyring.current.key, iv);
  cipher.setAAD(Buffer.from(associatedData, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [version, keyring.current.id, iv, cipher.getAuthTag(), ciphertext]
    .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
    .join('.');
}

function undecryptable(reason: string, cause?: unknown): AppBaseError {
  return new AppBaseError(encryptionErrorCodes.undecryptable, `cannot decrypt secret: ${reason}`, {
    cause,
  });
}

export function decrypt(envelope: string, associatedData: string, keyring: Keyring): string {
  const [envelopeVersion, id, iv, tag, ciphertext, ...extra] = envelope.split('.');
  if (
    envelopeVersion !== version ||
    !id ||
    !iv ||
    !tag ||
    ciphertext === undefined ||
    extra.length > 0
  ) {
    throw undecryptable('malformed envelope');
  }
  const entry = [keyring.current, ...keyring.previous].find((candidate) => candidate.id === id);
  if (!entry) {
    throw undecryptable(`unknown key ${id}`);
  }
  try {
    const decipher = createDecipheriv(algorithm, entry.key, Buffer.from(iv, 'base64url'));
    decipher.setAAD(Buffer.from(associatedData, 'utf8'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]);
    return plaintext.toString('utf8');
  } catch (error) {
    throw undecryptable('authentication failed', error);
  }
}

/** True when the value was sealed with a retired key and should be re-encrypted. */
export function needsRotation(envelope: string, keyring: Keyring): boolean {
  return envelope.split('.')[1] !== keyring.current.id;
}
