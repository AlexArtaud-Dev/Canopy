import type { CommandParam } from '@canopy/contracts';

import { displayArgv, initialValues, localized, requestValues } from './commands.utils';

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
});
