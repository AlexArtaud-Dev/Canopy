import { changePasswordSchema, describeUserAgent, profileSchema } from './account.utils';
import { invalidFields } from './auth.utils';

describe('profileSchema', () => {
  it('trims the name and turns an empty email into null', () => {
    expect(profileSchema.parse({ displayName: ' Ada ', contactEmail: '' })).toEqual({
      displayName: 'Ada',
      contactEmail: null,
    });
    expect(profileSchema.parse({ displayName: 'Ada', contactEmail: 'ada@example.com' })).toEqual({
      displayName: 'Ada',
      contactEmail: 'ada@example.com',
    });
  });

  it('flags a blank name and a malformed email', () => {
    expect(invalidFields(profileSchema, { displayName: ' ', contactEmail: 'x' })).toEqual(
      new Set(['displayName', 'contactEmail']),
    );
    expect(invalidFields(profileSchema, { displayName: 'Ada', contactEmail: '' })).toEqual(
      new Set(),
    );
  });

  it('reports a non-object input under an empty field name', () => {
    expect(invalidFields(profileSchema, null)).toEqual(new Set(['']));
  });
});

describe('changePasswordSchema', () => {
  const schema = changePasswordSchema(12);

  it('requires the policy length and a matching confirmation', () => {
    expect(
      invalidFields(schema, { currentPassword: '', newPassword: 'short', confirmPassword: 'x' }),
    ).toEqual(new Set(['currentPassword', 'newPassword', 'confirmPassword']));
    expect(
      schema.safeParse({
        currentPassword: 'old',
        newPassword: 'a long new passphrase',
        confirmPassword: 'a long new passphrase',
      }).success,
    ).toBe(true);
  });
});

describe('describeUserAgent', () => {
  it.each([
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0',
      { browser: 'Edge', os: 'Windows' },
    ],
    [
      'Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0',
      { browser: 'Firefox', os: 'Linux' },
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      { browser: 'Safari', os: 'iOS' },
    ],
    [
      'Mozilla/5.0 (Linux; Android 15; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
      { browser: 'Chrome', os: 'Android' },
    ],
    ['curl/8.0', { browser: null, os: null }],
    [null, { browser: null, os: null }],
  ])('%s', (userAgent, expected) => {
    expect(describeUserAgent(userAgent)).toEqual(expected);
  });
});
