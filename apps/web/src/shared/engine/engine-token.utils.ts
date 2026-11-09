/** PKCS#8 DER header for a raw Ed25519 private key (RFC 8410): the 32-byte seed follows it. */
const pkcs8Ed25519Prefix = Buffer.from('302e020100300506032b657004220420', 'hex');

/** Wraps the raw 32-byte Ed25519 seed (base64url) in PKCS#8 DER so Node can import it. */
export function pkcs8FromSeed(encodedSeed: string): Buffer {
  const seed = Buffer.from(encodedSeed.trim(), 'base64url');
  if (seed.length !== 32) {
    throw new Error(`engine private key: want 32 bytes, got ${String(seed.length)}`);
  }
  return Buffer.concat([pkcs8Ed25519Prefix, seed]);
}

export const engineTokenIssuer = 'canopy-web';
export const engineTokenAudience = 'canopy-engine';
/** Short enough that a leaked token is nearly useless; the engine refuses anything over 5 min. */
export const engineTokenLifetimeSeconds = 120;

/**
 * Stream tickets (downloads, uploads) live in an HttpOnly cookie the browser sends to
 * `/api/engine/stream/*`; the engine accepts this audience on streaming routes only.
 */
export const streamTicketAudience = 'canopy-engine-stream';
export const streamTicketCookie = 'canopy_stream';
export const streamTicketPath = '/api/engine/stream';

/**
 * Share link downloads: a ticket scoped to what was shared, in its own cookie and path so it never
 * replaces a signed-in visitor's own ticket (the relay mirrors these in engine-stream.utils.mjs).
 */
export const shareTicketCookie = 'canopy_share';
export const shareTicketPath = '/api/engine/share';
