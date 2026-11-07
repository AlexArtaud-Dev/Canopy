import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** RFC 6238 defaults every authenticator app supports: SHA-1, 6 digits, 30-second steps. */
export const totpStepSeconds = 30;
const digits = 6;
/** Accept the previous and next step too: phone clocks drift. */
const allowedDrift = 1;

const base32Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += base32Alphabet.charAt((value >>> (bits - 5)) & 31);
      bits -= 5;
    }
  }
  if (bits > 0) output += base32Alphabet.charAt((value << (5 - bits)) & 31);
  return output;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s=]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = base32Alphabet.indexOf(char);
    if (index === -1) throw new Error('invalid base32');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** RFC 4226 HOTP value for one counter. */
export function hotp(secret: Buffer, counter: number): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', secret).update(message).digest();
  const offset = digest.readUInt8(digest.length - 1) & 15;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** digits).padStart(digits, '0');
}

export function timeStep(now: Date): number {
  return Math.floor(now.getTime() / 1000 / totpStepSeconds);
}

/**
 * Returns the matched time step, or null. Steps at or before `lastUsedStep` are refused so an
 * observed code cannot be replayed within its validity window.
 */
export function verifyTotp(
  secret: Buffer,
  code: string,
  now: Date,
  lastUsedStep: number | null,
): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const current = timeStep(now);
  for (let step = current - allowedDrift; step <= current + allowedDrift; step += 1) {
    if (lastUsedStep !== null && step <= lastUsedStep) continue;
    if (timingSafeEqual(Buffer.from(hotp(secret, step)), Buffer.from(code))) return step;
  }
  return null;
}

/** `otpauth://` URI that authenticator apps read from the QR code. */
export function otpauthUri(issuer: string, account: string, secret: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(digits),
    period: String(totpStepSeconds),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Recovery codes: 10 base32 chars (50 bits) shown as `XXXXX-XXXXX`. */
export function formatRecoveryCode(randomBytes: Uint8Array): string {
  const raw = base32Encode(randomBytes).slice(0, 10);
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

/** Users may type codes in any case, with or without the dash or spaces. */
export function normalizeRecoveryCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z2-7]/g, '');
}

/** High-entropy codes need no slow hash; SHA-256 of the normalized form is enough. */
export function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(normalizeRecoveryCode(code)).digest('hex');
}

export type TwoFactorCode = { kind: 'totp'; code: string } | { kind: 'recovery'; code: string };

/** Six digits are an app code; anything else is tried as a recovery code. */
export function classifyCode(input: string): TwoFactorCode {
  const digitsOnly = input.replace(/\s/g, '');
  if (/^\d{6}$/.test(digitsOnly)) return { kind: 'totp', code: digitsOnly };
  return { kind: 'recovery', code: normalizeRecoveryCode(input) };
}
