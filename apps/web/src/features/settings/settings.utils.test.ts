import { z } from 'zod';

import { AppBaseError } from '@/shared/lib/errors';
import { defineSettings } from '@/shared/modules/settings.types';

import { resolveSettings, settingsErrorCodes, validateSettingUpdate } from './settings.utils';

const definition = defineSettings({
  schema: z.object({
    sessionDays: z.number().int().min(1).max(365).default(7),
    enforce2fa: z.boolean().default(false),
    smtpHost: z.string().default(''),
    theme: z.enum(['system', 'light', 'dark']).default('system'),
    publicName: z.string().default('Canopy'),
    motd: z.string().optional(),
  }),
  fields: {
    sessionDays: { group: 'sessions', env: 'CANOPY_SESSION_DAYS' },
    enforce2fa: { group: 'security', env: 'CANOPY_ENFORCE_2FA' },
    smtpHost: { group: 'smtp', sensitive: true },
    theme: { group: 'appearance' },
    publicName: { group: 'appearance', env: 'CANOPY_PUBLIC_NAME' },
    motd: { group: 'appearance', env: 'CANOPY_MOTD' },
  },
});

describe('resolveSettings', () => {
  it('returns defaults with nothing stored', () => {
    const resolved = resolveSettings(definition, [], {});
    expect(resolved.values).toEqual({
      sessionDays: 7,
      enforce2fa: false,
      smtpHost: '',
      theme: 'system',
      publicName: 'Canopy',
    });
    expect(resolved.locked.size + resolved.modified.size + resolved.invalid.length).toBe(0);
  });

  it('applies stored values and marks them modified', () => {
    const resolved = resolveSettings(
      definition,
      [
        { key: 'theme', value: 'dark' },
        { key: 'smtpHost', value: 'mail.example.org' },
      ],
      {},
    );
    expect(resolved.values.theme).toBe('dark');
    expect(resolved.values.smtpHost).toBe('mail.example.org');
    expect([...resolved.modified].sort()).toEqual(['smtpHost', 'theme']);
  });

  it('ignores invalid or unknown stored values and reports them', () => {
    const resolved = resolveSettings(
      definition,
      [
        { key: 'sessionDays', value: 9000 },
        { key: 'removedSetting', value: true },
      ],
      {},
    );
    expect(resolved.values.sessionDays).toBe(7);
    expect(resolved.invalid).toEqual(['sessionDays']);
  });

  it('lets environment variables win, coerced to the field type, and locks them', () => {
    const resolved = resolveSettings(definition, [{ key: 'sessionDays', value: 30 }], {
      CANOPY_SESSION_DAYS: '14',
      CANOPY_ENFORCE_2FA: 'yes',
    });
    expect(resolved.values.sessionDays).toBe(14);
    expect(resolved.values.enforce2fa).toBe(true);
    expect([...resolved.locked].sort()).toEqual(['enforce2fa', 'sessionDays']);
    expect(resolved.modified.has('sessionDays')).toBe(false);
  });

  it('passes string environment values through, with or without a default', () => {
    const resolved = resolveSettings(definition, [], {
      CANOPY_PUBLIC_NAME: 'Home NAS',
      CANOPY_MOTD: 'Maintenance at 22:00',
    });
    expect(resolved.values.publicName).toBe('Home NAS');
    expect(resolved.values.motd).toBe('Maintenance at 22:00');
  });

  it('falls back to the stored value when the environment value is invalid', () => {
    const resolved = resolveSettings(definition, [{ key: 'sessionDays', value: 30 }], {
      CANOPY_SESSION_DAYS: 'forever',
      CANOPY_ENFORCE_2FA: 'off',
    });
    expect(resolved.values.sessionDays).toBe(30);
    expect(resolved.values.enforce2fa).toBe(false);
    expect(resolved.invalid).toEqual(['sessionDays']);
  });
});

describe('validateSettingUpdate', () => {
  function codeOf(fn: () => unknown): string | undefined {
    try {
      fn();
    } catch (error) {
      return error instanceof AppBaseError ? error.code : 'not-an-app-error';
    }
    return undefined;
  }

  it('returns the parsed value', () => {
    expect(validateSettingUpdate(definition, 'sessionDays', 30, {})).toBe(30);
  });

  it.each([
    ['unknown key', 'nope', 1, {}, settingsErrorCodes.unknownKey],
    ['invalid value', 'sessionDays', 0, {}, settingsErrorCodes.invalidValue],
    ['env-locked key', 'sessionDays', 30, { CANOPY_SESSION_DAYS: '14' }, settingsErrorCodes.locked],
  ])('rejects an %s', (_label, key, value, env, code) => {
    expect(codeOf(() => validateSettingUpdate(definition, key, value, env))).toBe(code);
  });
});
