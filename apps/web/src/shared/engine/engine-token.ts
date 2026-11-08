import 'server-only';

import { createPrivateKey, type KeyObject } from 'node:crypto';

import { SignJWT } from 'jose';

import { parseServerEnv } from '@/shared/config/env';
import { AppBaseError } from '@/shared/lib/errors';

import {
  engineTokenAudience,
  engineTokenIssuer,
  engineTokenLifetimeSeconds,
  streamTicketAudience,
  pkcs8FromSeed,
} from './engine-token.utils';

export interface EnginePrincipal {
  userId: string;
  sessionId: string;
  permissions: readonly string[];
  /** Group ids: the engine resolves group path grants without reading the auth schema. */
  groups: readonly string[];
}

let signingKey: KeyObject | undefined;

function getSigningKey(): KeyObject {
  if (signingKey) return signingKey;
  const { CANOPY_ENGINE_PRIVATE_KEY } = parseServerEnv(process.env);
  if (!CANOPY_ENGINE_PRIVATE_KEY) {
    throw new AppBaseError(
      'system.engine_key_missing',
      'CANOPY_ENGINE_PRIVATE_KEY is not set; run `node scripts/dev/engine-keys.mjs`',
    );
  }
  signingKey = createPrivateKey({
    key: pkcs8FromSeed(CANOPY_ENGINE_PRIVATE_KEY),
    format: 'der',
    type: 'pkcs8',
  });
  return signingKey;
}

/** Signs a short-lived bearer token for one request to the engine (never sent to browsers). */
export function signEngineToken(principal: EnginePrincipal): Promise<string> {
  return sign(principal, engineTokenAudience);
}

/** Signs a stream ticket: accepted by the engine on download and upload routes only. */
export function signStreamTicket(principal: EnginePrincipal): Promise<string> {
  return sign(principal, streamTicketAudience);
}

function sign(principal: EnginePrincipal, audience: string): Promise<string> {
  return new SignJWT({
    sid: principal.sessionId,
    perms: principal.permissions,
    groups: principal.groups,
  })
    .setProtectedHeader({ alg: 'EdDSA' })
    .setIssuer(engineTokenIssuer)
    .setAudience(audience)
    .setSubject(principal.userId)
    .setIssuedAt()
    .setExpirationTime(`${String(engineTokenLifetimeSeconds)}s`)
    .sign(getSigningKey());
}
