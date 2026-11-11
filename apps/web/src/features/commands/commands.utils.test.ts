import type { CommandEntry, CommandParam } from '@canopy/contracts';

import {
  choiceLabel,
  displayArgv,
  firstToFill,
  initialValues,
  localized,
  pluginMenus,
  requestValues,
  targetParam,
  worksOn,
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

  it('groups plugin commands that take a folder', () => {
    const builtin = entry('rsync.sync', {});
    const run = entry('tool.run', { plugin });
    const check = entry('tool.check', { plugin });
    const noFolder = entry('other.ping', { plugin: { id: 'other', name: label }, params: [] });
    expect(targetParam(run)).toBe('source');
    expect(targetParam(noFolder)).toBeUndefined();
    expect(pluginMenus([builtin, run, noFolder, check], { kind: 'folder' })).toEqual([
      { plugin, entries: [run, check] },
    ]);
    expect(pluginMenus([builtin, run, noFolder, check], { kind: 'file', name: 'a.mkv' })).toEqual(
      [],
    );
  });

  it('offers a command on what its first path param works on', () => {
    const path = (extra: Partial<CommandParam>): CommandParam[] => [
      {
        name: 'target',
        type: 'path',
        access: 'read',
        label,
        required: true,
        secret: false,
        ...extra,
      },
    ];
    const onFolder = entry('tool.folder', { plugin, params: path({ on: 'folder' }) });
    const onAnyFile = entry('tool.file', { plugin, params: path({ on: 'file', extensions: [] }) });
    const onVideo = entry('tool.video', {
      plugin,
      params: path({ on: 'file', extensions: ['mkv'] }),
    });
    const film = { kind: 'file', name: 'Film.MKV' } as const;
    expect(worksOn(onFolder, { kind: 'folder' })).toBe(true);
    expect(worksOn(onFolder, film)).toBe(false);
    expect(worksOn(onAnyFile, { kind: 'folder' })).toBe(false);
    expect(worksOn(onAnyFile, { kind: 'file', name: 'README' })).toBe(true);
    expect(worksOn(onVideo, film)).toBe(true);
    expect(worksOn(onVideo, { kind: 'file', name: 'notes.txt' })).toBe(false);
    expect(worksOn(onVideo, { kind: 'file', name: '.mkv' })).toBe(false);
    expect(worksOn(onVideo, { kind: 'file', name: 'mkv' })).toBe(false);
    expect(pluginMenus([onFolder, onAnyFile, onVideo], film)).toEqual([
      { plugin, entries: [onAnyFile, onVideo] },
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
