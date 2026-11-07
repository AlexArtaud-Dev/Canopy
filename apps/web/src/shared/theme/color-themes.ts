/**
 * Registered color themes. `canopy` is the default tokens in globals.css; every other entry has a
 * token file in `themes/<name>.css` (light and dark blocks) imported by globals.css. Adding a theme
 * = one token file + one entry here + its label.
 */
export const colorThemes = ['canopy', 'ocean', 'violet', 'amber'] as const;
export type ColorTheme = (typeof colorThemes)[number];
