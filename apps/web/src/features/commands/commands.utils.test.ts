import type { CommandEntry, CommandParam } from '@canopy/contracts';

import {
  advancedInUse,
  castCommands,
  builtInGroup,
  choiceLabel,
  commandGroups,
  matchesQuery,
  maxRecent,
  recentEntries,
  searchable,
  splitParams,
  withRecent,
  displayArgv,
  firstToFill,
  hasExtension,
  pickerEntries,
  pickerStart,
  initialValues,
  localized,
  mergeChoices,
  parseChoices,
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

describe('choices from a command', () => {
  it('reads value and label from each line', () => {
    expect(
      parseChoices([
        'chromecast://192.168.1.42:8009\tLiving room (chromecast, Ultra)',
        'Searching…',
        '',
        '\tno value',
        '--delete\tnot an option',
        'http://192.168.1.20/d.xml\t',
        'chromecast://192.168.1.42:8009\tAgain',
        ' spaced \t Label ',
      ]),
    ).toEqual([
      { value: 'chromecast://192.168.1.42:8009', label: 'Living room (chromecast, Ultra)' },
      { value: 'http://192.168.1.20/d.xml', label: 'http://192.168.1.20/d.xml' },
      { value: 'spaced', label: 'Label' },
    ]);
    expect(parseChoices([])).toEqual([]);
  });

  it('lists saved values first, without repeating them', () => {
    const saved = [{ value: 'a', label: 'Saved A' }];
    const found = [
      { value: 'a', label: 'Found A' },
      { value: 'b', label: 'Found B' },
    ];
    expect(mergeChoices(saved, found)).toEqual([saved[0], found[1]]);
    expect(mergeChoices([], found)).toEqual(found);
    expect(mergeChoices(saved, [])).toEqual(saved);
  });
});

describe('commands page', () => {
  const entry = (id: string, extra: Partial<CommandEntry> = {}): CommandEntry => ({
    id,
    name: { en: `Name ${id}`, fr: `Nom ${id}`, es: `Nombre ${id}` },
    description: { en: 'Plays on a screen', fr: 'Lit sur un écran', es: 'Reproduce' },
    mode: 'basic',
    dryRun: false,
    params: [],
    ...extra,
  });
  const cast = { id: 'cast', name: { en: 'Cast', fr: 'Diffuser', es: 'Enviar' } };
  const zip = { id: 'zip', name: { en: 'Zip', fr: 'Zip', es: 'Zip' } };
  const rsync = entry('rsync.sync');
  const play = entry('cast.play', { plugin: cast });
  const entries = [
    rsync,
    play,
    entry('zip.make', { plugin: zip }),
    entry('cast.pause', { plugin: cast }),
    entry('cast.code', { plugin: cast, secondary: true }),
  ];

  it('groups by plugin in catalog order, built-in commands last, secondary ones out', () => {
    expect(
      commandGroups(entries, '').map((group) => [group.id, group.entries.map((e) => e.id)]),
    ).toEqual([
      ['cast', ['cast.play', 'cast.pause']],
      ['zip', ['zip.make']],
      [builtInGroup, ['rsync.sync']],
    ]);
    expect(commandGroups([entry('cast.code', { plugin: cast, secondary: true })], '')).toEqual([]);
  });

  it('searches every language, without accents, word by word', () => {
    expect(searchable('Écran Été')).toBe('ecran ete');
    expect(matchesQuery(play, '  ')).toBe(true);
    expect(matchesQuery(play, 'ecran diffuser')).toBe(true);
    expect(matchesQuery(play, 'nombre')).toBe(true);
    expect(matchesQuery(play, 'cast.play')).toBe(true);
    expect(matchesQuery(play, 'ecran zip')).toBe(false);
    expect(matchesQuery(rsync, 'diffuser')).toBe(false);
    expect(commandGroups(entries, 'zip').map((group) => group.id)).toEqual(['zip']);
  });

  it('keeps the latest commands first, once each', () => {
    expect(withRecent([], 'a')).toEqual(['a']);
    expect(withRecent(['a', 'b', 'c'], 'c')).toEqual(['c', 'a', 'b']);
    expect(withRecent(['a', 'b', 'c', 'd', 'e'], 'f')).toHaveLength(maxRecent);
    expect(
      recentEntries(['gone', 'cast.code', 'zip.make', 'rsync.sync'], entries).map((e) => e.id),
    ).toEqual(['zip.make', 'rsync.sync']);
  });

  it('folds advanced options, opened when one holds something', () => {
    const folded: CommandParam[] = [
      { name: 'file', type: 'path', access: 'read', label, required: true, secret: false },
      {
        name: 'port',
        type: 'int',
        label,
        required: false,
        secret: false,
        default: 8690,
        advanced: true,
      },
      { name: 'host', type: 'string', label, required: false, secret: false, advanced: true },
    ];
    const { essential, advanced } = splitParams(folded);
    expect(essential.map((param) => param.name)).toEqual(['file']);
    expect(advanced.map((param) => param.name)).toEqual(['port', 'host']);
    expect(advancedInUse(folded, initialValues(folded, { file: '/a' }))).toBe(false);
    expect(advancedInUse(folded, initialValues(folded, { host: '10.0.0.2' }))).toBe(true);
    expect(advancedInUse(folded, { file: '/a' })).toBe(false);
  });
});

describe('path picker', () => {
  const at = (name: string, isDirectory = false) => ({ name, path: `/m/${name}`, isDirectory });
  const entries = [
    at('b.MKV'),
    at('Films', true),
    at('.hidden', true),
    at('a.txt'),
    at('10.mp4'),
    at('2.mp4'),
    at('Docs', true),
  ];

  it('lists folders, then the files the param accepts, in natural order', () => {
    expect(pickerEntries(entries, 'folder').map((e) => e.name)).toEqual(['Docs', 'Films']);
    expect(pickerEntries(entries, 'file', ['mkv', 'mp4']).map((e) => e.name)).toEqual([
      'Docs',
      'Films',
      '2.mp4',
      '10.mp4',
      'b.MKV',
    ]);
    expect(pickerEntries(entries, 'file')).toHaveLength(7 - 1);
  });

  it('knows extensions and where to open', () => {
    expect(hasExtension('x.Mp4', ['mp4'])).toBe(true);
    expect(hasExtension('mp4', ['mp4'])).toBe(false);
    expect(hasExtension('x.avi', [])).toBe(true);
    expect(pickerStart('', 'file')).toBe('/');
    expect(pickerStart('relative/x', 'file')).toBe('/');
    expect(pickerStart('/media/films/x.mkv', 'file')).toBe('/media/films');
    expect(pickerStart('/x.mkv', 'file')).toBe('/');
    expect(pickerStart(' /media/films ', 'folder')).toBe('/media/films');
  });
});

describe('cast commands', () => {
  const plugin = { id: 'cast', name: { en: 'Cast', fr: 'Cast', es: 'Cast' } };
  const video: CommandParam = {
    name: 'file',
    type: 'path',
    access: 'read',
    on: 'file',
    extensions: ['mkv'],
    label,
    required: true,
    secret: false,
  };
  const screen: CommandParam = {
    name: 'to',
    type: 'string',
    device: 'screen',
    label,
    required: true,
    secret: false,
  };
  const entry = (
    id: string,
    params: CommandParam[],
    extra: Partial<CommandEntry> = {},
  ): CommandEntry => ({
    id,
    name: label,
    description: label,
    mode: 'basic',
    dryRun: false,
    params,
    plugin,
    ...extra,
  });

  it('are plugin commands taking the file and a device', () => {
    const entries = [
      entry('cast.play', [video, screen]),
      entry('cast.info', [video]),
      entry('cast.pause', [screen]),
      entry('cast.hidden', [video, screen], { secondary: true }),
      (({ plugin: _plugin, ...builtIn }) => builtIn)(entry('rsync.play', [video, screen])),
    ];
    expect(castCommands(entries, 'Film.MKV').map((item) => item.id)).toEqual(['cast.play']);
    expect(castCommands(entries, 'notes.txt')).toEqual([]);
  });
});
