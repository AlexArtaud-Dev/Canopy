import {
  actionPresets,
  breadcrumbs,
  browseInputSchema,
  cleanVirtualPath,
  grantInputSchema,
  grantSubjectSchema,
  pathActions,
} from './files.utils';

describe('cleanVirtualPath', () => {
  it.each([
    ['/', '/'],
    ['/a/./b//c/', '/a/b/c'],
    ['/a/../../etc', '/etc'],
    ['/photos/été', '/photos/été'],
  ])('%s → %s', (input, expected) => {
    expect(cleanVirtualPath(input)).toBe(expected);
  });

  it.each(['relative', '', '/a\0b', `/${'a'.repeat(4096)}`])('rejects %j', (input) => {
    expect(cleanVirtualPath(input)).toBeNull();
  });
});

describe('breadcrumbs', () => {
  it('lists every ancestor from the root', () => {
    expect(breadcrumbs('/a/b')).toEqual([
      { name: '/', path: '/' },
      { name: 'a', path: '/a' },
      { name: 'b', path: '/a/b' },
    ]);
    expect(breadcrumbs('/')).toEqual([{ name: '/', path: '/' }]);
  });
});

describe('grant schemas', () => {
  it('cleans the path and requires known actions', () => {
    expect(
      grantInputSchema.parse({
        subjectType: 'group',
        subjectId: 'g1',
        path: '/media/./photos/',
        actions: ['read'],
        effect: 'allow',
      }).path,
    ).toBe('/media/photos');
    expect(
      grantInputSchema.safeParse({
        subjectType: 'group',
        subjectId: 'g1',
        path: 'media',
        actions: ['read'],
        effect: 'allow',
      }).success,
    ).toBe(false);
    expect(browseInputSchema.parse({ path: '/a/../b' })).toEqual({ path: '/b' });
    expect(grantSubjectSchema.safeParse({ subjectType: 'robot', subjectId: 'x' }).success).toBe(
      false,
    );
  });

  it('offers presets made of declared actions', () => {
    expect(actionPresets.full).toEqual([...pathActions]);
    expect(actionPresets.readOnly).toEqual(['read', 'download']);
    expect(actionPresets.readWrite).not.toContain('delete');
  });
});
