import {
  compareVersions,
  findAsset,
  flagsSchema,
  githubReleaseSchema,
  installSchema,
  isReleaseDownload,
  manifestAssetName,
  maxNotesLength,
  maxTextAssetBytes,
  multipartFrame,
  parseRepos,
  pluginIdSchema,
  releaseVersion,
  sameRepo,
  toReleaseView,
  updateAvailable,
} from './plugins.utils';

const release = githubReleaseSchema.parse({
  tag_name: 'v1.2.0',
  html_url: 'https://github.com/o/tool/releases/tag/v1.2.0',
  published_at: '2026-01-01T00:00:00Z',
  body: null,
  assets: [
    {
      name: manifestAssetName,
      browser_download_url: 'https://github.com/o/tool/releases/download/v1.2.0/canopy-plugin.yaml',
      size: 900,
    },
  ],
});

describe('parseRepos', () => {
  it('keeps valid owner/name entries once, in order', () => {
    expect(parseRepos(' o/tool, O/Tool\nbad repo/x/y other/one ,,')).toEqual([
      'o/tool',
      'other/one',
    ]);
    expect(parseRepos('')).toEqual([]);
  });

  it('compares repositories without case', () => {
    expect(sameRepo('O/Tool', 'o/tool')).toBe(true);
    expect(sameRepo('o/tool', 'o/other')).toBe(false);
  });
});

describe('releases', () => {
  it('reads what the page shows', () => {
    expect(toReleaseView(release)).toEqual({
      version: '1.2.0',
      notes: '',
      url: 'https://github.com/o/tool/releases/tag/v1.2.0',
      publishedAt: '2026-01-01T00:00:00Z',
    });
    expect(releaseVersion('1.0.0')).toBe('1.0.0');
  });

  it('cuts long notes', () => {
    const long = githubReleaseSchema.parse({ ...release, body: 'x'.repeat(maxNotesLength + 10) });
    expect(long.body).toHaveLength(maxNotesLength);
  });

  it('finds assets by name', () => {
    expect(findAsset(release, manifestAssetName)?.size).toBe(900);
    expect(findAsset(release, 'nope')).toBeUndefined();
  });

  it('accepts downloads from the repository releases only', () => {
    const url = 'https://github.com/o/tool/releases/download/v1/x';
    expect(isReleaseDownload(url, 'O/Tool')).toBe(true);
    expect(isReleaseDownload('https://evil.example/o/tool/releases/download/v1/x', 'o/tool')).toBe(
      false,
    );
    expect(isReleaseDownload('https://github.com/o/tool/releases/download/../../x', 'o/tool')).toBe(
      false,
    );
  });
});

describe('versions', () => {
  it.each([
    ['1.2.10', '1.2.9', 1],
    ['v1.0.0', '1.0.0', 0],
    ['1.0', '1.0.1', -1],
    ['1.0.1', '1.0', 1],
    ['1.0.0', '1.0.0-beta', 1],
    ['1.0.0-beta', '1.0.0', -1],
    ['1.0.0-beta.2', '1.0.0-beta.1', 1],
    ['1.0.0+build-7', '1.0.0', 0],
    ['x.y', '0.0.0', 0],
  ])('%s vs %s', (a, b, expected) => {
    expect(compareVersions(a, b)).toBe(expected);
  });

  it('offers newer releases unless pinned', () => {
    expect(updateAvailable('1.0.0', 'v1.1.0', false)).toBe(true);
    expect(updateAvailable('1.0.0', 'v1.1.0', true)).toBe(false);
    expect(updateAvailable('1.1.0', 'v1.1.0', false)).toBe(false);
  });
});

describe('multipartFrame', () => {
  it('frames text fields then the binary part', () => {
    const { head, tail } = multipartFrame('B', [['manifest', 'm']], 'binary');
    expect(head).toBe(
      '--B\r\nContent-Disposition: form-data; name="manifest"\r\n\r\nm\r\n' +
        '--B\r\nContent-Disposition: form-data; name="binary"; filename="binary"\r\n' +
        'Content-Type: application/octet-stream\r\n\r\n',
    );
    expect(tail).toBe('\r\n--B--\r\n');
  });
});

describe('inputs', () => {
  it('validates actions input', () => {
    expect(flagsSchema.safeParse({ id: 'tool', enabled: true, pinned: false }).success).toBe(true);
    expect(pluginIdSchema.safeParse({ id: '' }).success).toBe(false);
    expect(installSchema.safeParse({ repo: 'o/tool' }).success).toBe(true);
    expect(installSchema.safeParse({ repo: 'https://x' }).success).toBe(false);
    expect(maxTextAssetBytes).toBe(65536);
  });
});
