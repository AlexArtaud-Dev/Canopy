import { z } from 'zod';

import { defineSettings } from '@/shared/modules/settings.types';

import {
  describeField,
  describeModule,
  matchesSearch,
  parseFieldInput,
  settingResetSchema,
  settingUpdateSchema,
} from './settings-form.utils';

describe('describeField', () => {
  it.each([
    [z.boolean().default(false), { kind: 'boolean' }],
    [z.boolean(), { kind: 'boolean' }],
    [z.number().int(), { kind: 'number', min: null, max: null }],
    [z.number().int().min(1).max(365).default(30), { kind: 'number', min: 1, max: 365 }],
    [z.number().default(1), { kind: 'number', min: null, max: null }],
    [z.enum(['a', 'b']).default('a'), { kind: 'select', options: ['a', 'b'] }],
    [z.string().max(20).default(''), { kind: 'text', maxLength: 20, email: false }],
    [
      z.union([z.literal(''), z.email()]).default(''),
      { kind: 'text', maxLength: null, email: true },
    ],
    [z.array(z.string()).default([]), { kind: 'text', maxLength: null, email: false }],
  ])('%#', (type, expected) => {
    expect(describeField(type)).toEqual(expected);
  });
});

describe('describeModule', () => {
  const definition = defineSettings({
    schema: z.object({
      days: z.number().int().min(1).default(30),
      token: z.string().default(''),
    }),
    fields: {
      days: { group: 'general', localOnly: true, requiresRestart: true, env: 'X_DAYS' },
      token: { group: 'secrets', sensitive: true },
    },
  });

  it('describes each field and withholds sensitive values', () => {
    const fields = describeModule(definition, {
      values: { days: 7, token: 'secret' },
      locked: new Set(['days']),
      modified: new Set(['days', 'token']),
    });
    expect(fields).toEqual([
      {
        key: 'days',
        group: 'general',
        control: { kind: 'number', min: 1, max: null },
        value: 7,
        defaultValue: 30,
        sensitive: false,
        locked: true,
        localOnly: true,
        requiresRestart: true,
        modified: true,
        env: 'X_DAYS',
      },
      expect.objectContaining({ key: 'token', value: null, defaultValue: null, sensitive: true }),
    ]);
  });

  it('falls back to a text control for fields missing from the schema', () => {
    const broken = { ...definition, fields: { ...definition.fields, ghost: { group: 'x' } } };
    const ghost = describeModule(broken, {
      values: {},
      locked: new Set(),
      modified: new Set(),
    }).find((field) => field.key === 'ghost');
    expect(ghost?.control).toEqual({ kind: 'text', maxLength: null, email: false });
  });
});

describe('matchesSearch', () => {
  it('matches any text, case-insensitively', () => {
    expect(matchesSearch('', 'anything')).toBe(true);
    expect(matchesSearch(' Lock ', 'Lockout threshold', 'x')).toBe(true);
    expect(matchesSearch('smtp', 'Session lifetime')).toBe(false);
  });
});

describe('parseFieldInput', () => {
  it('converts form values per control', () => {
    expect(parseFieldInput({ kind: 'boolean' }, true)).toBe(true);
    expect(parseFieldInput({ kind: 'boolean' }, 'false')).toBe(false);
    expect(parseFieldInput({ kind: 'number', min: null, max: null }, '12')).toBe(12);
    expect(parseFieldInput({ kind: 'number', min: null, max: null }, '')).toBeNaN();
    expect(parseFieldInput({ kind: 'select', options: [] }, 'a')).toBe('a');
    expect(parseFieldInput({ kind: 'text', maxLength: null, email: false }, true)).toBe('true');
  });
});

describe('action schemas', () => {
  it('require a module and a key', () => {
    expect(settingUpdateSchema.safeParse({ module: 'auth', key: 'x', value: 1 }).success).toBe(
      true,
    );
    expect(settingResetSchema.safeParse({ module: '', key: 'x' }).success).toBe(false);
  });
});
