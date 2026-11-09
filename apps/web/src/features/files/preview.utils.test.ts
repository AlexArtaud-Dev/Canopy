/** @jest-environment node */

import {
  canPreview,
  codeLanguage,
  decodeText,
  previewNeighbours,
  textPreviewBytes,
} from './preview.utils';

const entry = (path: string, preview: 'none' | 'image' | 'text', actions = ['download']) => ({
  path,
  preview,
  actions,
});

describe('canPreview', () => {
  it('needs a viewer and the download right', () => {
    expect(canPreview(entry('/a', 'image'))).toBe(true);
    expect(canPreview(entry('/a', 'none'))).toBe(false);
    expect(canPreview(entry('/a', 'image', ['read']))).toBe(false);
  });
});

describe('previewNeighbours', () => {
  const entries = [
    entry('/a', 'image'),
    entry('/b', 'none'),
    entry('/c', 'text'),
    entry('/d', 'image', ['read']),
    entry('/e', 'image'),
  ];
  it('skips what cannot be previewed', () => {
    expect(previewNeighbours(entries, '/c')).toEqual({ previous: entries[0], next: entries[4] });
    expect(previewNeighbours(entries, '/a')).toEqual({ previous: undefined, next: entries[2] });
    expect(previewNeighbours(entries, '/e')).toEqual({ previous: entries[2], next: undefined });
  });
  it('has none for an unknown path', () => {
    expect(previewNeighbours(entries, '/z')).toEqual({ previous: undefined, next: undefined });
  });
});

describe('codeLanguage', () => {
  it('maps extensions and well-known names', () => {
    expect(codeLanguage('main.GO')).toBe('go');
    expect(codeLanguage('Dockerfile')).toBe('docker');
    expect(codeLanguage('notes.txt')).toBeNull();
    expect(codeLanguage('.env')).toBeNull();
  });
});

describe('decodeText', () => {
  it('decodes UTF-8 and spots binaries', () => {
    expect(decodeText(new TextEncoder().encode('héllo'))).toEqual({ kind: 'text', text: 'héllo' });
    expect(decodeText(new Uint8Array([104, 0, 105]))).toEqual({ kind: 'binary' });
    expect(textPreviewBytes).toBe(524288);
  });
});
