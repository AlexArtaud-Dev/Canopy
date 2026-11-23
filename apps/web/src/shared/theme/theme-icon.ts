import type { ColorTheme } from './color-themes';
import { oklchCss } from './oklch';
import { themePalette } from './theme-palette';

/** The mark's colours: the theme's dark-mode accent for the tile, its text colour for the tree. */
export function markColors(theme: ColorTheme): { tile: string; tree: string } {
  const palette = themePalette(theme);
  return { tile: oklchCss(palette.primaryDark), tree: oklchCss(palette.onPrimaryDark) };
}

/** The tab icon: Canopy's tree on a rounded tile, in the theme's colours. */
export function themeIconSvg(theme: ColorTheme): string {
  const { tile, tree } = markColors(theme);
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">',
    `<rect width="32" height="32" rx="8" fill="${tile}"/>`,
    '<g transform="translate(4 4)">',
    `<path d="M12 2.5 4.5 10h15L12 2.5Z" fill="${tree}" opacity="0.55"/>`,
    `<path d="M12 6.5 3 15.5h18L12 6.5Z" fill="${tree}" opacity="0.8"/>`,
    `<path d="M12 11 2 21h20L12 11Z" fill="${tree}"/>`,
    '</g>',
    '</svg>',
  ].join('');
}

/** Where a theme's tab icon is served (public, cached: the drawing never changes). */
export function themeIconPath(theme: ColorTheme): string {
  return `/theme-icon/${theme}`;
}
