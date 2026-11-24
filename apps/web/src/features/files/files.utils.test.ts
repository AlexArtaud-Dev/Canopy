import {
  actionPresets,
  breadcrumbs,
  crumbsFold,
  crumbVisible,
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

describe('breadcrumb folding', () => {
  const shown = (count: number, wide: boolean) =>
    Array.from({ length: count }, (_, index) => index).filter((index) =>
      crumbVisible(index, count, wide),
    );

  it('keeps the root and the open folder on a phone', () => {
    expect(shown(2, false)).toEqual([0, 1]);
    expect(shown(5, false)).toEqual([0, 4]);
    expect(crumbsFold(2)).toEqual({ phone: false, wide: false });
    expect(crumbsFold(3).phone).toBe(true);
  });

  it('keeps the parent too on a wider screen, and short paths whole', () => {
    expect(shown(4, true)).toEqual([0, 1, 2, 3]);
    expect(shown(6, true)).toEqual([0, 4, 5]);
    expect(crumbsFold(4).wide).toBe(false);
    expect(crumbsFold(5).wide).toBe(true);
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
