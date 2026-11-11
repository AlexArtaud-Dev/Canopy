import type { CommandEntry, CommandParam } from '@canopy/contracts';

import {
  isSavable,
  maxSavedPerField,
  savableFields,
  savedDefaults,
  savedValueInputSchema,
  savedValueKeySchema,
  savedValuesSchema,
  withSavedValue,
  withoutSavedValue,
  type SavedValues,
} from './saved-values.utils';

const tv = { label: 'Living room', value: 'chromecast://192.168.1.42' };
const bedroom = { label: 'Bedroom', value: 'chromecast://192.168.1.43' };

describe('savedValuesSchema', () => {
  it('accepts what the page stores', () => {
    const stored: SavedValues = { dapple: { device: [tv] } };
    expect(savedValuesSchema.parse(stored)).toEqual(stored);
    expect(savedValuesSchema.parse({})).toEqual({});
  });

  it('refuses anything else, so that the default applies', () => {
    for (const bad of [
      'text',
      [],
      { dapple: { device: [{ label: '', value: 'x' }] } },
      { 'Bad Id': { device: [tv] } },
      { dapple: { 'bad field': [tv] } },
      { dapple: { device: [{ label: 'x', value: '--rm' }] } },
    ]) {
      expect(savedValuesSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe('withSavedValue', () => {
  it('adds values, keeping the others', () => {
    const one = withSavedValue({}, 'dapple', 'device', tv);
    expect(one).toEqual({ dapple: { device: [tv] } });
    const two = withSavedValue(one ?? {}, 'dapple', 'device', bedroom);
    expect(two).toEqual({ dapple: { device: [tv, bedroom] } });
    expect(withSavedValue(two ?? {}, 'dapple', 'port', { label: '8690', value: '8690' })).toEqual({
      dapple: { device: [tv, bedroom], port: [{ label: '8690', value: '8690' }] },
    });
    expect(withSavedValue(two ?? {}, 'other', 'host', tv)).toEqual({
      dapple: { device: [tv, bedroom] },
      other: { host: [tv] },
    });
  });

  it('replaces a value saved again under a new label', () => {
    const renamed = { label: 'Salon', value: tv.value };
    expect(
      withSavedValue({ dapple: { device: [tv, bedroom] } }, 'dapple', 'device', renamed),
    ).toEqual({ dapple: { device: [bedroom, renamed] } });
  });

  it('refuses more than a field holds', () => {
    const full = Array.from({ length: maxSavedPerField }, (_, index) => ({
      label: `TV ${index}`,
      value: `tv-${index}`,
    }));
    expect(withSavedValue({ dapple: { device: full } }, 'dapple', 'device', tv)).toBeNull();
    expect(
      withSavedValue({ dapple: { device: full } }, 'dapple', 'device', full[3] ?? tv),
    ).not.toBeNull();
  });
});

describe('withoutSavedValue', () => {
  const saved: SavedValues = {
    dapple: { device: [tv, bedroom], port: [bedroom] },
    other: { host: [tv] },
  };

  it('removes one value', () => {
    expect(withoutSavedValue(saved, 'dapple', 'device', tv.value)).toEqual({
      dapple: { device: [bedroom], port: [bedroom] },
      other: { host: [tv] },
    });
  });

  it('drops fields and plugins left empty', () => {
    expect(withoutSavedValue(saved, 'dapple', 'port', bedroom.value)).toEqual({
      dapple: { device: [tv, bedroom] },
      other: { host: [tv] },
    });
    expect(withoutSavedValue(saved, 'other', 'host', tv.value)).toEqual({ dapple: saved.dapple });
  });

  it('leaves the rest alone when there is nothing to remove', () => {
    expect(withoutSavedValue(saved, 'dapple', 'device', 'unknown')).toEqual(saved);
    expect(withoutSavedValue(saved, 'missing', 'device', tv.value)).toEqual(saved);
  });
});

describe('savedDefaults', () => {
  it('starts each field with its first saved value', () => {
    expect(
      savedDefaults({ device: [tv, bedroom], port: [{ label: 'p', value: '8690' }], none: [] }),
    ).toEqual({
      device: tv.value,
      port: '8690',
    });
    expect(savedDefaults(undefined)).toEqual({});
  });
});

describe('savable fields', () => {
  const label = { en: 'L', fr: 'L', es: 'L' };
  const param = (name: string, type: CommandParam['type'], secret = false): CommandParam => ({
    name,
    type,
    label,
    required: false,
    secret,
  });
  const entry = (id: string, plugin: string | undefined, params: CommandParam[]): CommandEntry => ({
    id,
    name: label,
    description: label,
    mode: 'basic',
    dryRun: false,
    params,
    ...(plugin ? { plugin: { id: plugin, name: label } } : {}),
  });

  it('takes free text and numbers, never secrets, paths or choices', () => {
    expect(isSavable(param('a', 'string'))).toBe(true);
    expect(isSavable(param('a', 'int'))).toBe(true);
    expect(isSavable(param('a', 'string', true))).toBe(false);
    expect(isSavable(param('a', 'path'))).toBe(false);
    expect(isSavable(param('a', 'enum'))).toBe(false);
    expect(isSavable(param('a', 'bool'))).toBe(false);
  });

  it('lists the fields of a plugin once each', () => {
    const entries = [
      entry('dapple.cast', 'dapple', [
        param('file', 'path'),
        param('device', 'string'),
        param('port', 'int'),
      ]),
      entry('dapple.stop', 'dapple', [param('device', 'string'), param('token', 'string', true)]),
      entry('other.run', 'other', [param('host', 'string')]),
      entry('rsync.sync', undefined, [param('limit', 'int')]),
    ];
    expect(savableFields(entries, 'dapple').map((field) => field.name)).toEqual(['device', 'port']);
    expect(savableFields(entries, 'none')).toEqual([]);
  });
});

describe('input schemas', () => {
  it('accept a labelled value for a plugin field', () => {
    const input = {
      plugin: 'dapple',
      field: 'device',
      label: ' Living room ',
      value: ' chromecast://1.2.3.4 ',
    };
    expect(savedValueInputSchema.parse(input)).toEqual({
      plugin: 'dapple',
      field: 'device',
      label: 'Living room',
      value: 'chromecast://1.2.3.4',
    });
    expect(
      savedValueKeySchema.safeParse({ plugin: 'dapple', field: 'device', value: 'x' }).success,
    ).toBe(true);
  });

  it('refuse what could not be sent to a command', () => {
    const base = { plugin: 'dapple', field: 'device', label: 'TV', value: 'tv' };
    for (const bad of [
      { ...base, plugin: 'Dapple' },
      { ...base, field: 'my field' },
      { ...base, label: ' ' },
      { ...base, value: '' },
      { ...base, value: '--delete' },
      { ...base, value: 'x'.repeat(501) },
    ]) {
      expect(savedValueInputSchema.safeParse(bad).success).toBe(false);
    }
    expect(
      savedValueKeySchema.safeParse({ plugin: 'x y', field: 'device', value: 'x' }).success,
    ).toBe(false);
  });
});
