import {
  canDropInto,
  childPath,
  conflictStrategies,
  dragBadgeGap,
  downloadHref,
  previewHref,
  dropOperation,
  entryNameSchema,
  operationTargets,
  pointerBadgeOffset,
  sourceAction,
  stemLength,
  strategiesFor,
  transferDecisions,
  transferInputSchema,
  transferJobInputSchema,
  transferOperations,
  type TransferConflict,
} from './operations.utils';

const conflict = (target: string, overrides: Partial<TransferConflict> = {}): TransferConflict => ({
  source: `/src${target}`,
  target,
  sourceIsDirectory: false,
  targetIsDirectory: false,
  self: false,
  ...overrides,
});

describe('names and paths', () => {
  it('validates entry names like the engine', () => {
    for (const ok of ['photo.jpg', 'été', ' padded ', '.env']) {
      expect(entryNameSchema.safeParse(ok).success).toBe(true);
    }
    for (const bad of ['', '.', '..', 'a/b', 'a\\b', 'tab\there', 'x'.repeat(256)]) {
      expect(entryNameSchema.safeParse(bad).success).toBe(false);
    }
    expect(entryNameSchema.parse(' padded ')).toBe('padded');
  });

  it('builds child paths and rename selections', () => {
    expect(childPath('/', 'a')).toBe('/a');
    expect(childPath('/a', 'b')).toBe('/a/b');
    expect(stemLength('photo.final.jpg', false)).toBe(11);
    expect(stemLength('.env', false)).toBe(4);
    expect(stemLength('v1.2', true)).toBe(4);
  });

  it('accepts only clean transfer requests', () => {
    const request = { operation: 'copy', sources: ['/a'], destination: '/b' };
    expect(transferInputSchema.safeParse(request).success).toBe(true);
    expect(transferInputSchema.safeParse({ ...request, sources: ['/a/../x'] }).success).toBe(false);
    expect(transferInputSchema.safeParse({ ...request, sources: [] }).success).toBe(false);
    expect(
      transferJobInputSchema.safeParse({
        ...request,
        strategy: 'skip',
        decisions: { '/b/a': 'overwrite' },
      }).success,
    ).toBe(true);
    expect(transferJobInputSchema.safeParse({ ...request, strategy: 'merge' }).success).toBe(false);
    expect(sourceAction('move')).toBe('move');
    expect(transferOperations).toEqual(['copy', 'move']);
    expect(conflictStrategies).toEqual(['skip', 'overwrite', 'keep_both']);
  });
});

describe('selection and drops', () => {
  it('acts on the selection when the clicked entry is in it', () => {
    expect(operationTargets(new Set(['/a', '/b']), '/a')).toEqual(['/a', '/b']);
    expect(operationTargets(new Set(['/a', '/b']), '/c')).toEqual(['/c']);
  });

  it('copies with a modifier, moves otherwise', () => {
    expect(dropOperation({ ctrlKey: false, altKey: false, metaKey: false })).toBe('move');
    expect(dropOperation({ ctrlKey: true, altKey: false, metaKey: false })).toBe('copy');
    expect(dropOperation({ ctrlKey: false, altKey: true, metaKey: false })).toBe('copy');
    expect(dropOperation({ ctrlKey: false, altKey: false, metaKey: true })).toBe('copy');
  });

  it('refuses drops into themselves or no-op moves', () => {
    expect(canDropInto(['/a/x'], '/b', 'move')).toBe(true);
    expect(canDropInto(['/a/x'], '/a/x', 'copy')).toBe(false);
    expect(canDropInto(['/a/x'], '/a/x/deep', 'copy')).toBe(false);
    expect(canDropInto(['/a/x'], '/a', 'move')).toBe(false);
    expect(canDropInto(['/a/x'], '/a', 'copy')).toBe(true);
    expect(canDropInto(['/x'], '/', 'move')).toBe(false);
    expect(canDropInto([], '/b', 'move')).toBe(false);
  });
});

describe('conflict decisions', () => {
  it('records only choices differing from the general strategy', () => {
    const conflicts = [conflict('/d/a'), conflict('/d/b'), conflict('/d/c', { self: true })];
    expect(transferDecisions(conflicts, { '/d/a': 'overwrite', '/d/b': 'skip' }, 'skip')).toEqual({
      strategy: 'skip',
      decisions: { '/d/a': 'overwrite', '/d/c': 'keep_both' },
    });
    expect(transferDecisions(conflicts, {}, 'keep_both')).toEqual({
      strategy: 'keep_both',
      decisions: {},
    });
  });

  it('offers only the strategies that apply', () => {
    expect(strategiesFor(conflict('/a'))).toEqual(['skip', 'overwrite', 'keep_both']);
    expect(strategiesFor(conflict('/a', { self: true }))).toEqual(['keep_both']);
    expect(strategiesFor(conflict('/a', { sourceIsDirectory: true }))).toEqual([
      'skip',
      'keep_both',
    ]);
  });
});

describe('pointerBadgeOffset', () => {
  it('puts the badge beside the grab point', () => {
    expect(pointerBadgeOffset({ clientX: 300, clientY: 120 }, { left: 0, top: 100 })).toEqual({
      x: 300 + dragBadgeGap.x,
      y: 20 + dragBadgeGap.y,
    });
    expect(pointerBadgeOffset(null, { left: 0, top: 0 })).toEqual({ x: 0, y: 0 });
    expect(pointerBadgeOffset({ clientX: 1, clientY: 1 }, null)).toEqual({ x: 0, y: 0 });
  });
});

describe('previewHref', () => {
  it('reads the file inline', () => {
    expect(previewHref('/a b.png')).toBe('/api/engine/stream/v1/fs/preview?path=%2Fa%20b.png');
  });
});

describe('downloadHref', () => {
  it('downloads one file directly and zips anything else', () => {
    expect(downloadHref([{ path: '/a b.txt', isDirectory: false }])).toBe(
      '/api/engine/stream/v1/fs/download?path=%2Fa%20b.txt',
    );
    expect(downloadHref([{ path: '/photos', isDirectory: true }])).toBe(
      '/api/engine/stream/v1/fs/archive?path=%2Fphotos',
    );
    expect(
      downloadHref([
        { path: '/a', isDirectory: false },
        { path: '/b', isDirectory: false },
      ]),
    ).toBe('/api/engine/stream/v1/fs/archive?path=%2Fa&path=%2Fb');
    expect(downloadHref([])).toBeNull();
  });
});
