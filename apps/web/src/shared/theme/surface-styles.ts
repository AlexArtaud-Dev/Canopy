/**
 * How panes are drawn. `glass` (default): frosted, translucent layers over a soft wallpaper in the
 * colour theme (`surfaces/glass.css`, applied by `<html data-surface>`); `solid`: opaque panes.
 */
export const surfaceStyles = ['glass', 'solid'] as const;
export type SurfaceStyle = (typeof surfaceStyles)[number];
