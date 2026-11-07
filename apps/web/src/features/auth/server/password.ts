import 'server-only';

import { hash, verify } from '@node-rs/argon2';

// OWASP baseline for argon2id: 19 MiB, 2 iterations, 1 lane (~50 ms on a small server).
const options = {
  // `Algorithm.Argon2id`: the package ships a const enum, which isolated modules cannot read.
  algorithm: 2,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, options);
}

/** Parameters are read from the stored hash, so older hashes keep verifying after a tune-up. */
export async function verifyPassword({
  hash: stored,
  password,
}: {
  hash: string;
  password: string;
}): Promise<boolean> {
  try {
    return await verify(stored, password);
  } catch {
    // A malformed or foreign hash is a failed login, not a server error.
    return false;
  }
}
