import type { ColorTheme } from './color-themes';
import type { Oklch } from './oklch';

/** A colour theme's key colours (the same numbers as its token file), for places without tokens. */
export interface ThemePalette {
  /** Accent in light mode (`--primary`). */
  primary: Oklch;
  /** Accent in dark mode, and text on it. */
  primaryDark: Oklch;
  onPrimaryDark: Oklch;
  /** Companion colours (`--chart-2`, `--chart-4`). */
  second: Oklch;
  fourth: Oklch;
}

/** Each theme's accent hue; Graphite is neutral and has its own palette. */
const hues: Record<Exclude<ColorTheme, 'graphite'>, number> = {
  canopy: 162,
  ocean: 245,
  violet: 295,
  amber: 65,
  rose: 5,
  teal: 190,
  indigo: 265,
  sunset: 40,
  aurora: 180,
};

/** Themes whose companions differ from the default ones (see their token files). */
const companions: Partial<Record<ColorTheme, Pick<ThemePalette, 'second' | 'fourth'>>> = {
  sunset: { second: [0.6, 0.12, 350], fourth: [0.58, 0.1, 305] },
  aurora: { second: [0.6, 0.11, 145], fourth: [0.58, 0.1, 290] },
  graphite: { second: [0.62, 0.03, 230], fourth: [0.55, 0.02, 290] },
};

export function themePalette(theme: ColorTheme): ThemePalette {
  const second: Oklch = [0.55, 0.08, 200];
  const fourth: Oklch = [0.58, 0.1, 280];
  if (theme === 'graphite') {
    return {
      primary: [0.29, 0.01, 260],
      primaryDark: [0.9, 0.01, 260],
      onPrimaryDark: [0.2, 0.01, 260],
      second,
      fourth,
      ...companions.graphite,
    };
  }
  const hue = hues[theme];
  return {
    primary: [0.47, 0.09, hue],
    primaryDark: [0.76, 0.11, hue],
    onPrimaryDark: [0.22, 0.04, hue],
    second,
    fourth,
    ...companions[theme],
  };
}
