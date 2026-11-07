/**
 * @jest-environment node
 */
import {
  actionLink,
  actionTokenLifetimeMs,
  actionTokenSchema,
  forgotPasswordSchema,
  hashActionToken,
  isNewDevice,
} from './action-token.utils';

describe('action tokens', () => {
  it('hashes deterministically without keeping the token', () => {
    expect(hashActionToken('abc')).toBe(hashActionToken('abc'));
    expect(hashActionToken('abc')).toMatch(/^[0-9a-f]{64}$/);
    expect(hashActionToken('abc')).not.toContain('abc');
  });

  it('builds the set-password link on the public URL', () => {
    expect(actionLink('https://files.example.com', 'tok_en-1')).toBe(
      'https://files.example.com/set-password?token=tok_en-1',
    );
  });

  it('accepts only 43-character base64url tokens', () => {
    expect(actionTokenSchema.safeParse('a'.repeat(43)).success).toBe(true);
    expect(actionTokenSchema.safeParse('a'.repeat(42)).success).toBe(false);
    expect(actionTokenSchema.safeParse(`${'a'.repeat(42)}=`).success).toBe(false);
  });

  it('gives invitations a week and resets an hour', () => {
    expect(actionTokenLifetimeMs.invitation).toBe(7 * 24 * 3_600_000);
    expect(actionTokenLifetimeMs.password_reset).toBe(3_600_000);
  });

  it('trims the forgot-password identifier', () => {
    expect(forgotPasswordSchema.parse({ identifier: ' ada ' })).toEqual({ identifier: 'ada' });
  });
});

describe('isNewDevice', () => {
  const seen = { device: 'Firefox|Linux', ipAddress: '10.0.0.2' };

  it('is new unless another session shares device and address', () => {
    expect(isNewDevice(seen, [seen])).toBe(false);
    expect(isNewDevice(seen, [{ ...seen, ipAddress: '10.0.0.3' }])).toBe(true);
    expect(isNewDevice(seen, [])).toBe(true);
  });
});
