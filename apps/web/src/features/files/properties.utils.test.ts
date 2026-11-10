/** @jest-environment node */

import { formatOctal, readChecksum, readFolderSize } from './properties.utils';

describe('formatOctal', () => {
  it('writes permission bits like chmod', () => {
    expect(formatOctal(0o750)).toBe('750');
    expect(formatOctal(0o7)).toBe('007');
    expect(formatOctal(0o4755)).toBe('4755');
  });
});

describe('readFolderSize', () => {
  it('reads a finished measure', () => {
    expect(readFolderSize({ bytes: 10, files: 2, folders: 1, skipped: 0 })).toEqual({
      bytes: 10,
      files: 2,
      folders: 1,
      skipped: 0,
    });
    expect(readFolderSize({ bytes: 10, files: 2, folders: 1 })?.skipped).toBe(0);
  });

  it('has nothing to show before the result', () => {
    expect(readFolderSize(undefined)).toBeNull();
    expect(readFolderSize({ bytes: 'many' })).toBeNull();
  });
});

describe('readChecksum', () => {
  it('reads the digest', () => {
    expect(readChecksum({ algorithm: 'sha256', hash: 'ab12', bytes: 3 })).toBe('ab12');
  });

  it('refuses anything else', () => {
    expect(readChecksum(undefined)).toBeNull();
    expect(readChecksum({ algorithm: 'sha256', hash: '<script>' })).toBeNull();
  });
});
