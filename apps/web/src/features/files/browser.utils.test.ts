import {
  browserHref,
  browserPageSize,
  browserQuerySchema,
  emptySelection,
  fileKind,
  formatBytes,
  gridColumns,
  moveFocus,
  nextSort,
  pageJump,
  parentPath,
  reduceSelection,
  sortKeys,
} from './browser.utils';

describe('browserQuerySchema', () => {
  it('cleans the path and falls back on junk', () => {
    expect(browserQuerySchema.parse({ path: '/a/../b/', sort: 'size', order: 'desc' })).toEqual({
      path: '/b',
      sort: 'size',
      order: 'desc',
    });
    expect(browserQuerySchema.parse({ path: 'relative', sort: 'x', order: ['y'] })).toEqual({
      path: '/',
      sort: 'name',
      order: 'asc',
    });
    expect(browserQuerySchema.parse({})).toEqual({ path: '/', sort: 'name', order: 'asc' });
  });
});

describe('browserHref', () => {
  it('omits defaults', () => {
    expect(browserHref({ path: '/', sort: 'name', order: 'asc' })).toBe('/');
    expect(browserHref({ path: '/a b', sort: 'size', order: 'desc' })).toBe(
      '/?path=%2Fa+b&sort=size&order=desc',
    );
  });
});

describe('nextSort and parentPath', () => {
  it('flips the active column and starts others ascending', () => {
    const query = { path: '/', sort: 'name', order: 'asc' } as const;
    expect(nextSort(query, 'name')).toEqual({ sort: 'name', order: 'desc' });
    expect(nextSort({ ...query, order: 'desc' }, 'name')).toEqual({ sort: 'name', order: 'asc' });
    expect(nextSort(query, 'size')).toEqual({ sort: 'size', order: 'asc' });
  });

  it('walks up one level', () => {
    expect(parentPath('/')).toBeNull();
    expect(parentPath('/a')).toBe('/');
    expect(parentPath('/a/b')).toBe('/a');
  });
});

describe('reduceSelection', () => {
  const keys = ['a', 'b', 'c', 'd'];

  it('selects one, toggles and selects all', () => {
    const one = reduceSelection(emptySelection, { type: 'only', key: 'b' }, keys);
    expect([...one.selected]).toEqual(['b']);
    const toggled = reduceSelection(one, { type: 'toggle', key: 'd' }, keys);
    expect([...toggled.selected]).toEqual(['b', 'd']);
    expect([...reduceSelection(toggled, { type: 'toggle', key: 'b' }, keys).selected]).toEqual([
      'd',
    ]);
    expect(reduceSelection(toggled, { type: 'all' }, keys).selected.size).toBe(4);
    expect(reduceSelection(toggled, { type: 'clear' }, keys)).toBe(emptySelection);
  });

  it('selects ranges from the anchor in either direction', () => {
    const anchored = reduceSelection(emptySelection, { type: 'only', key: 'c' }, keys);
    expect([...reduceSelection(anchored, { type: 'range', key: 'a' }, keys).selected]).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect([...reduceSelection(anchored, { type: 'range', key: 'd' }, keys).selected]).toEqual([
      'c',
      'd',
    ]);
    expect(
      reduceSelection(emptySelection, { type: 'range', key: 'b' }, keys).selected.has('b'),
    ).toBe(true);
    expect(reduceSelection(anchored, { type: 'range', key: 'zz' }, keys)).toBe(anchored);
  });

  it('drops keys that disappeared after a reload', () => {
    const state = { selected: new Set(['a', 'x']), anchor: 'x' };
    expect(reduceSelection(state, { type: 'retain' }, keys)).toEqual({
      selected: new Set(['a']),
      anchor: null,
    });
    const kept = { selected: new Set(['a']), anchor: 'a' };
    expect(reduceSelection(kept, { type: 'retain' }, keys).anchor).toBe('a');
  });
});

describe('moveFocus', () => {
  it('moves by rows in the grid and by one in the list', () => {
    expect(moveFocus(0, 'ArrowDown', 10, 1)).toBe(1);
    expect(moveFocus(0, 'ArrowUp', 10, 1)).toBe(0);
    expect(moveFocus(0, 'ArrowRight', 10, 1)).toBeNull();
    expect(moveFocus(3, 'ArrowLeft', 10, 1)).toBeNull();
    expect(moveFocus(1, 'ArrowDown', 10, 4)).toBe(5);
    expect(moveFocus(9, 'ArrowDown', 10, 4)).toBe(9);
    expect(moveFocus(5, 'ArrowLeft', 10, 4)).toBe(4);
    expect(moveFocus(5, 'ArrowRight', 10, 4)).toBe(6);
    expect(moveFocus(5, 'Home', 10, 1)).toBe(0);
    expect(moveFocus(5, 'End', 10, 1)).toBe(9);
    expect(moveFocus(0, 'PageDown', 100, 1)).toBe(10);
    expect(moveFocus(50, 'PageUp', 100, 2)).toBe(30);
    expect(moveFocus(0, 'x', 10, 1)).toBeNull();
    expect(moveFocus(0, 'ArrowDown', 0, 1)).toBeNull();
  });

  it('fits grid columns to the width', () => {
    expect(gridColumns(0, 140, 12)).toBe(1);
    expect(gridColumns(600, 140, 12)).toBe(4);
    expect(gridColumns(590, 140, 12)).toBe(3);
    expect(gridColumns(100, 140, 12)).toBe(1);
  });
});

describe('formatBytes', () => {
  it('uses binary units in the locale', () => {
    expect(formatBytes(512, 'en')).toBe('512 byte');
    expect(formatBytes(1536, 'en')).toBe('1.5 kB');
    expect(formatBytes(200 * 1024 * 1024, 'en')).toBe('200 MB');
    expect(formatBytes(-1, 'en')).toBe('0 byte');
    expect(formatBytes(1536, 'fr')).toMatch(/^1,5\sko$/);
  });
});

describe('fileKind', () => {
  it('classifies by extension', () => {
    expect(fileKind('Photos', true)).toBe('folder');
    expect(fileKind('cat.JPG', false)).toBe('image');
    expect(fileKind('notes.md', false)).toBe('text');
    expect(fileKind('report.pdf', false)).toBe('document');
    expect(fileKind('.bashrc', false)).toBe('file');
    expect(fileKind('Makefile', false)).toBe('file');
    expect(fileKind('data.bin', false)).toBe('file');
  });
});

describe('constants', () => {
  it('pages by 500, jumps by 10 and sorts by name, size or date', () => {
    expect(browserPageSize).toBe(500);
    expect(pageJump).toBe(10);
    expect(sortKeys).toEqual(['name', 'size', 'modified']);
  });
});
