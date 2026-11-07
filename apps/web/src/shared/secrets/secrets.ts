import 'server-only';

import { parseServerEnv } from '@/shared/config/env';
import { AppBaseError } from '@/shared/lib/errors';

import { createKeyring, decrypt, encrypt, needsRotation, type Keyring } from './envelope';

let keyring: Keyring | undefined;

function getKeyring(): Keyring {
  if (keyring) {
    return keyring;
  }
  const env = parseServerEnv(process.env);
  if (!env.CANOPY_ENCRYPTION_KEY) {
    throw new AppBaseError(
      'system.encryption_key_missing',
      'CANOPY_ENCRYPTION_KEY is not set; generate one with `openssl rand -base64 32`',
    );
  }
  keyring = createKeyring(
    env.CANOPY_ENCRYPTION_KEY,
    env.CANOPY_ENCRYPTION_KEY_PREVIOUS.split(',').map((value) => value.trim()),
  );
  return keyring;
}

/** Seals a secret for storage. `purpose` binds it to one use, e.g. `auth.totp:<userId>`. */
export function sealSecret(plaintext: string, purpose: string): string {
  return encrypt(plaintext, purpose, getKeyring());
}

export function openSecret(envelope: string, purpose: string): string {
  return decrypt(envelope, purpose, getKeyring());
}

export function isSealedWithRetiredKey(envelope: string): boolean {
  return needsRotation(envelope, getKeyring());
}
