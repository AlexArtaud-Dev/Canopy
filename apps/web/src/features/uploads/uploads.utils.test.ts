import {
  isActive,
  keepBothName,
  planUploads,
  refusalCode,
  relativeDirOf,
  topLevelName,
  uploadChunkSize,
  uploadConcurrency,
  uploadEndpoint,
  uploadMetadata,
  uploadPercent,
  uploadRate,
} from './uploads.utils';

const file = (name: string) => new File(['x'], name);

describe('names and metadata', () => {
  it('splits relative paths and finds the top-level name', () => {
    expect(relativeDirOf('trip/day 1/a.jpg')).toBe('trip/day 1');
    expect(relativeDirOf('a.jpg')).toBe('');
    expect(topLevelName({ name: 'a.jpg', relativeDir: 'trip/day 1' })).toBe('trip');
    expect(topLevelName({ name: 'a.jpg', relativeDir: '' })).toBe('a.jpg');
  });

  it('builds the tus metadata', () => {
    expect(
      uploadMetadata({ destination: '/in', name: 'a', relativeDir: '', strategy: 'skip' }),
    ).toEqual({
      destination: '/in',
      filename: 'a',
      relativeDir: '',
      strategy: 'skip',
    });
    expect(uploadEndpoint).toBe('/api/engine/stream/v1/uploads/');
    expect(uploadChunkSize).toBe(32 * 1024 * 1024);
    expect(uploadConcurrency).toBe(3);
  });

  it('keeps both like the engine', () => {
    const taken = new Set(['a (1).txt']);
    expect(keepBothName('a.txt', false, (name) => taken.has(name))).toBe('a (2).txt');
    expect(keepBothName('v1.2', true, () => false)).toBe('v1.2 (1)');
    expect(keepBothName('.env', false, () => false)).toBe('.env (1)');
  });
});

describe('planUploads', () => {
  it('applies conflict choices per top-level name', () => {
    const picked = [
      { file: file('a.txt'), relativeDir: '' },
      { file: file('new.txt'), relativeDir: '' },
      { file: file('x.jpg'), relativeDir: 'trip/day' },
      { file: file('y.jpg'), relativeDir: 'trip' },
    ];
    const existing = new Set(['a.txt', 'trip', 'trip (1)']);
    const plan = planUploads(picked, existing, { 'a.txt': 'overwrite' }, 'keep_both');
    expect(plan.map((item) => [item.file.name, item.relativeDir, item.strategy])).toEqual([
      ['a.txt', '', 'overwrite'],
      ['new.txt', '', 'skip'],
      ['x.jpg', 'trip (2)/day', 'skip'],
      ['y.jpg', 'trip (2)', 'skip'],
    ]);
    expect(planUploads(picked, existing, {}, 'overwrite')[2]?.relativeDir).toBe('trip/day');
  });
});

describe('progress and errors', () => {
  it('reads refusal codes from tus bodies', () => {
    expect(refusalCode('files.exists: Conflict\n')).toBe('files.exists');
    expect(refusalCode('oops')).toBeNull();
    expect(refusalCode(undefined)).toBeNull();
  });

  it('computes progress and speed', () => {
    expect(uploadPercent({ sent: 50, size: 200, state: 'uploading' })).toBe(25);
    expect(uploadPercent({ sent: 0, size: 0, state: 'uploading' })).toBe(0);
    expect(uploadPercent({ sent: 0, size: 0, state: 'done' })).toBe(100);
    expect(uploadPercent({ sent: 300, size: 200, state: 'uploading' })).toBe(100);
    expect(uploadRate({ sent: 2000, startedAt: 0 }, 2000)).toBe(1000);
    expect(uploadRate({ sent: 2000, startedAt: 0 }, 500)).toBeNull();
    expect(uploadRate({ sent: 0, startedAt: null }, 5000)).toBeNull();
    expect(isActive({ state: 'queued' })).toBe(true);
    expect(isActive({ state: 'done' })).toBe(false);
  });
});
