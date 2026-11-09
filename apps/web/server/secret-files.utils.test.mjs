import { resolveSecretFiles } from './secret-files.utils.mjs';

describe('resolveSecretFiles', () => {
  const files = { '/run/a': ' from-file\n', '/run/b': 'other' };
  const read = (path) => files[path];

  it('reads CANOPY_*_FILE into the variable', () => {
    expect(resolveSecretFiles({ CANOPY_A_FILE: '/run/a' }, read)).toEqual({
      CANOPY_A: 'from-file',
    });
  });

  it('keeps a value set directly, and ignores other prefixes and empty paths', () => {
    expect(
      resolveSecretFiles(
        { CANOPY_B: 'direct', CANOPY_B_FILE: '/run/b', OTHER_FILE: '/run/a', CANOPY_C_FILE: '' },
        read,
      ),
    ).toEqual({});
  });
});
