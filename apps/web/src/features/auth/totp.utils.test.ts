/**
 * @jest-environment node
 */
import {
  base32Decode,
  base32Encode,
  classifyCode,
  formatRecoveryCode,
  hashRecoveryCode,
  hotp,
  normalizeRecoveryCode,
  otpauthUri,
  timeStep,
  totpStepSeconds,
  verifyTotp,
} from './totp.utils';

// RFC 6238 appendix B: SHA-1 secret "12345678901234567890".
const rfcSecret = Buffer.from('12345678901234567890');

describe('base32', () => {
  it('round-trips and matches RFC 4648 vectors', () => {
    expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
    expect(base32Encode(Buffer.from('f'))).toBe('MY');
    expect(base32Decode('mzxw6ytboi======').toString()).toBe('foobar');
    expect(base32Decode(base32Encode(rfcSecret)).equals(rfcSecret)).toBe(true);
  });

  it('rejects characters outside the alphabet', () => {
    expect(() => base32Decode('ABC1')).toThrow('invalid base32');
  });
});

describe('hotp / totp', () => {
  it('matches the RFC 6238 test vectors (6 digits)', () => {
    expect(hotp(rfcSecret, timeStep(new Date(59_000)))).toBe('287082');
    expect(hotp(rfcSecret, timeStep(new Date(1_111_111_109_000)))).toBe('081804');
    expect(hotp(rfcSecret, timeStep(new Date(2_000_000_000_000)))).toBe('279037');
  });

  const now = new Date(1_111_111_109_000);
  const step = timeStep(now);

  it('accepts the current code and one step of drift', () => {
    expect(verifyTotp(rfcSecret, hotp(rfcSecret, step), now, null)).toBe(step);
    expect(verifyTotp(rfcSecret, hotp(rfcSecret, step - 1), now, null)).toBe(step - 1);
    expect(verifyTotp(rfcSecret, hotp(rfcSecret, step + 1), now, null)).toBe(step + 1);
  });

  it('refuses codes out of the window, malformed codes and replays', () => {
    expect(verifyTotp(rfcSecret, hotp(rfcSecret, step - 2), now, null)).toBeNull();
    expect(verifyTotp(rfcSecret, '12345', now, null)).toBeNull();
    expect(verifyTotp(rfcSecret, hotp(rfcSecret, step), now, step)).toBeNull();
  });

  it('uses 30-second steps', () => {
    expect(totpStepSeconds).toBe(30);
  });
});

describe('otpauthUri', () => {
  it('builds the URI authenticator apps scan', () => {
    expect(otpauthUri('Canopy', 'ada', 'ABC')).toBe(
      'otpauth://totp/Canopy%3Aada?secret=ABC&issuer=Canopy&algorithm=SHA1&digits=6&period=30',
    );
  });
});

describe('recovery codes', () => {
  it('formats 10 base32 characters as XXXXX-XXXXX', () => {
    expect(formatRecoveryCode(Buffer.from('foobar'))).toBe('MZXW6-YTBOI');
  });

  it('hashes the normalized form so typing variations still match', () => {
    expect(normalizeRecoveryCode(' mzxw6-ytboi ')).toBe('MZXW6YTBOI');
    expect(hashRecoveryCode('mzxw6 ytboi')).toBe(hashRecoveryCode('MZXW6-YTBOI'));
    expect(hashRecoveryCode('MZXW6-YTBOI')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('tells app codes from recovery codes', () => {
    expect(classifyCode('123 456')).toEqual({ kind: 'totp', code: '123456' });
    expect(classifyCode('mzxw6-ytboi')).toEqual({ kind: 'recovery', code: 'MZXW6YTBOI' });
  });
});
