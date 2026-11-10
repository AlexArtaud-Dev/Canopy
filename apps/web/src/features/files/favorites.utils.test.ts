/** @jest-environment node */

import { favoriteInputSchema, favoriteName, maxFavorites, toFavorites } from './favorites.utils';

describe('favoriteInputSchema', () => {
  it('cleans the path', () => {
    expect(favoriteInputSchema.parse({ path: '/media//films/./' }).path).toBe('/media/films');
  });

  it('refuses the root and invalid paths', () => {
    expect(favoriteInputSchema.safeParse({ path: '/' }).success).toBe(false);
    expect(favoriteInputSchema.safeParse({ path: 'media' }).success).toBe(false);
  });
});

describe('favoriteName', () => {
  it('is the folder name', () => {
    expect(favoriteName('/media/films')).toBe('films');
    expect(favoriteName('/')).toBe('/');
  });
});

describe('toFavorites', () => {
  it('keeps the order and marks folders that can no longer be opened', () => {
    expect(toFavorites(['/b', '/a/c'], new Set(['/a/c']))).toEqual([
      { path: '/b', name: 'b', available: false },
      { path: '/a/c', name: 'c', available: true },
    ]);
  });
});

describe('maxFavorites', () => {
  it('keeps the sidebar list short', () => {
    expect(maxFavorites).toBe(50);
  });
});
