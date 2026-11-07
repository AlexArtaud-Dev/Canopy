import { decide, lockoutState, rateLimitKey } from './rate-limit.utils';

const rule = { limit: 5, windowSeconds: 60 };
const windowStart = new Date('2026-11-07T10:00:00.000Z');

describe('decide', () => {
  it('allows hits within the limit and reports what is left', () => {
    expect(decide(rule, 3, windowStart, new Date('2026-11-07T10:00:10.000Z'))).toEqual({
      allowed: true,
      remaining: 2,
      retryAfterSeconds: 0,
    });
  });

  it('allows the last hit exactly at the limit', () => {
    expect(decide(rule, 5, windowStart, windowStart)).toMatchObject({
      allowed: true,
      remaining: 0,
    });
  });

  it('blocks over the limit until the window resets', () => {
    expect(decide(rule, 6, windowStart, new Date('2026-11-07T10:00:45.200Z'))).toEqual({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 15,
    });
  });

  it('never asks to retry in less than a second', () => {
    expect(
      decide(rule, 9, windowStart, new Date('2026-11-07T10:01:30.000Z')).retryAfterSeconds,
    ).toBe(1);
  });
});

describe('rateLimitKey', () => {
  it('namespaces the subject', () => {
    expect(rateLimitKey('auth.login', '203.0.113.7')).toBe('auth.login:203.0.113.7');
  });
});

describe('lockoutState', () => {
  const start = new Date('2026-11-07T12:00:00Z');
  const at = (seconds: number) => new Date(start.getTime() + seconds * 1000);

  it('stays open below the limit', () => {
    expect(lockoutState(rule, 4, start, at(10))).toEqual({ locked: false, retryAfterSeconds: 0 });
  });

  it('locks at the limit until the window ends', () => {
    expect(lockoutState(rule, 5, start, at(10))).toEqual({ locked: true, retryAfterSeconds: 50 });
  });

  it('lifts once the window is over', () => {
    expect(lockoutState(rule, 9, start, at(60))).toEqual({ locked: false, retryAfterSeconds: 0 });
  });
});
