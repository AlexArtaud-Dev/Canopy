/**
 * How panes are drawn. `glass` (default): frosted, translucent layers over a soft wallpaper in the
 * colour theme (`surfaces/glass.css`, applied by `<html data-surface>`); `solid`: opaque panes;
 * `cyberpunk`, `bento`, `flat`, `minimal`: one stylesheet each in `surfaces/`.
 */
export const surfaceStyles = ['glass', 'solid', 'cyberpunk', 'bento', 'flat', 'minimal'] as const;
export type SurfaceStyle = (typeof surfaceStyles)[number];
