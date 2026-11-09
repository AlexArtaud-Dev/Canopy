import { createHmac } from 'node:crypto';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function fromBase32(text: string): Buffer {
  let bits = '';
  for (const char of text.replace(/=+$/, '').toUpperCase()) {
    const value = alphabet.indexOf(char);
    if (value >= 0) bits += value.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

/** The 6-digit code an authenticator app shows for a base32 secret (RFC 6238: SHA-1, 30 s). */
export function totpCode(secret: string, now = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)));
  const digest = createHmac('sha1', fromBase32(secret)).update(counter).digest();
  const offset = (digest.at(-1) ?? 0) & 0xf;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

/** Waits for the next 30 s step: a code already used once is refused (replay protection). */
export async function nextStepCode(secret: string, usedAt: number): Promise<string> {
  const nextStep = (Math.floor(usedAt / 30_000) + 1) * 30_000;
  const wait = nextStep - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait + 250));
  return totpCode(secret);
}
