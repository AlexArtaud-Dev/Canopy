import type { CommandEntry, CommandParam } from '@canopy/contracts';

import {
  choiceLabel,
  displayArgv,
  firstToFill,
  folderParam,
  initialValues,
  localized,
  pluginMenus,
  requestValues,
} from './commands.utils';

const label = { en: 'L', fr: 'L', es: 'L' };
const params: CommandParam[] = [
  { name: 'source', type: 'path', access: 'read', label, required: true, secret: false },
  { name: 'deep', type: 'bool', label, required: false, secret: false, default: true },
  { name: 'limit', type: 'int', label, required: false, secret: false, default: 5 },
  {
    name: 'level',
    type: 'enum',
    label,
    required: false,
    secret: false,
    values: ['a', 'b'],
    default: 'a',
  },
  { name: 'note', type: 'string', label, required: false, secret: false },
];

describe('commands utils', () => {
  it('starts from the defaults', () => {
    expect(initialValues(params)).toEqual({
      source: '',
      deep: true,
      limit: '5',
      level: 'a',
      note: '',
    });
  });

  it('sends typed values and leaves empty fields out', () => {
    expect(
      requestValues(params, { source: '/a', deep: false, limit: '12', level: 'b', note: '  ' }),
    ).toEqual({ source: '/a', deep: false, limit: 12, level: 'b' });
    expect(requestValues(params, {})).toEqual({});
  });

  it('shows the argument list readably', () => {
    expect(displayArgv('rsync', ['-a', '/srv/my files/', "it's"])).toBe(
      `rsync -a '/srv/my files/' 'it'\\''s'`,
    );
  });

  it('picks the label language', () => {
    const text = { en: 'Sync', fr: 'Synchroniser', es: 'Sincronizar' };
    expect([localized(text, 'fr'), localized(text, 'es'), localized(text, 'de')]).toEqual([
      'Synchroniser',
      'Sincronizar',
      'Sync',
    ]);
  });

  it('presets some values', () => {
    expect(initialValues(params, { source: '/Series', deep: false })).toMatchObject({
      source: '/Series',
      deep: false,
      limit: '5',
    });
  });

  it('focuses the first required field still empty', () => {
    expect(firstToFill(params, initialValues(params))).toBe('source');
    expect(firstToFill(params, initialValues(params, { source: '/a' }))).toBeUndefined();
  });

  it('groups plugin commands that take a folder', () => {
    const plugin = { id: 'tool', name: label };
    const entry = (id: string, extra: Partial<CommandEntry>): CommandEntry => ({
      id,
      name: label,
      description: label,
      mode: 'basic',
      dryRun: false,
      params,
      ...extra,
    });
    const builtin = entry('rsync.sync', {});
    const run = entry('tool.run', { plugin });
    const check = entry('tool.check', { plugin });
    const noFolder = entry('other.ping', { plugin: { id: 'other', name: label }, params: [] });
    expect(folderParam(run)).toBe('source');
    expect(folderParam(noFolder)).toBeUndefined();
    expect(pluginMenus([builtin, run, noFolder, check])).toEqual([
      { plugin, entries: [run, check] },
    ]);
  });
});

describe('choiceLabel', () => {
  const param = { choices: [{ value: 's', label: { en: 'Skip', fr: 'Ignorer', es: 'Omitir' } }] };

  it('names a value in the person language', () => {
    expect(choiceLabel(param, 's', 'fr')).toBe('Ignorer');
  });

  it('falls back to the raw value', () => {
    expect(choiceLabel(param, 'a', 'en')).toBe('a');
    expect(choiceLabel({}, 'fast', 'en')).toBe('fast');
  });
});
