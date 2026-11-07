import {
  activityGranularitySeconds,
  evaluateSession,
  initialsOf,
  invalidAccountFields,
  newAccountSchema,
  passwordSchema,
  safeRedirectPath,
  signInInputSchema,
  syntheticEmail,
  usernameSchema,
} from './auth.utils';

const policy = { sessionLifetimeDays: 30, idleTimeoutMinutes: 60 };
const now = new Date('2026-11-07T12:00:00Z');
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000);

describe('evaluateSession', () => {
  it('keeps a recent, recently used session', () => {
    expect(
      evaluateSession({ createdAt: minutesAgo(120), updatedAt: minutesAgo(5) }, policy, now),
    ).toBe('active');
  });

  it('ends a session past its absolute lifetime even if active', () => {
    const createdAt = minutesAgo(30 * 24 * 60);
    expect(evaluateSession({ createdAt, updatedAt: minutesAgo(1) }, policy, now)).toBe('expired');
  });

  it('ends a session unused for the idle timeout', () => {
    expect(
      evaluateSession({ createdAt: minutesAgo(120), updatedAt: minutesAgo(60) }, policy, now),
    ).toBe('idle');
  });
});

describe('safeRedirectPath', () => {
  it.each([
    ['/system', '/system'],
    ['/files?path=%2Fdocs', '/files?path=%2Fdocs'],
    [undefined, '/'],
    [null, '/'],
    ['', '/'],
    ['https://evil.example', '/'],
    ['//evil.example', '/'],
    ['/\\evil.example', '/'],
    ['/login', '/'],
    ['/setup/done', '/'],
  ])('%s → %s', (candidate, expected) => {
    expect(safeRedirectPath(candidate)).toBe(expected);
  });
});

describe('syntheticEmail', () => {
  it('uses the reserved .invalid TLD so nothing is ever delivered', () => {
    expect(syntheticEmail('abc')).toBe('abc@users.canopy.invalid');
  });
});

describe('usernameSchema', () => {
  it.each(['ada', 'ada.lovelace', 'Ada_2', 'a-b'])('accepts %s', (value) => {
    expect(usernameSchema.safeParse(value).success).toBe(true);
  });

  it.each(['ab', '.ada', 'ada lovelace', 'a'.repeat(33), 'adà'])('rejects %s', (value) => {
    expect(usernameSchema.safeParse(value).success).toBe(false);
  });
});

describe('newAccountSchema', () => {
  const valid = {
    username: 'ada',
    displayName: 'Ada',
    contactEmail: '',
    password: 'correct horse battery',
    confirmPassword: 'correct horse battery',
  };

  it('treats an empty email as absent', () => {
    expect(newAccountSchema.parse(valid).contactEmail).toBeUndefined();
    expect(newAccountSchema.parse({ ...valid, contactEmail: 'ada@example.com' }).contactEmail).toBe(
      'ada@example.com',
    );
  });

  it('lists every invalid field', () => {
    expect(invalidAccountFields(valid)).toEqual(new Set());
    expect(
      invalidAccountFields({
        ...valid,
        username: 'a',
        contactEmail: 'nope',
        password: 'short',
        confirmPassword: 'other',
      }),
    ).toEqual(new Set(['username', 'contactEmail', 'password', 'confirmPassword']));
  });

  it('reports a non-object input under an empty field name', () => {
    expect(invalidAccountFields(null)).toEqual(new Set(['']));
  });
});

describe('signInInputSchema', () => {
  it('trims the username and keeps the password verbatim', () => {
    expect(signInInputSchema.parse({ username: ' ada ', password: ' pw ' })).toEqual({
      username: 'ada',
      password: ' pw ',
    });
  });
});

describe('initialsOf', () => {
  it.each([
    ['Ada Lovelace', 'AL'],
    ['Ada Byron Lovelace', 'AL'],
    ['admin', 'AD'],
    ['  ', '?'],
  ])('%s → %s', (name, expected) => {
    expect(initialsOf(name)).toBe(expected);
  });
});

describe('policy constants', () => {
  it('records activity often enough for the shortest idle timeout (15 min)', () => {
    expect(activityGranularitySeconds).toBeLessThanOrEqual(15 * 60);
  });

  it('requires at least 12 password characters', () => {
    expect(passwordSchema.safeParse('a'.repeat(11)).success).toBe(false);
    expect(passwordSchema.safeParse('a'.repeat(12)).success).toBe(true);
  });
});
