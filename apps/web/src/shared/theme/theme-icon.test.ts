import { colorThemes } from './color-themes';
import { markColors, themeIconPath, themeIconSvg } from './theme-icon';

describe('theme icon', () => {
  it.each(colorThemes)('draws the %s mark in its own colours', (theme) => {
    const { tile, tree } = markColors(theme);
    const svg = themeIconSvg(theme);
    expect(svg).toContain(`fill="${tile}"`);
    expect(svg).toContain(`fill="${tree}"`);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(themeIconPath(theme)).toBe(`/theme-icon/${theme}`);
  });

  it('keeps the default mark green and gives Graphite a neutral one', () => {
    expect(markColors('canopy').tile).toBe('oklch(0.76 0.11 162)');
    expect(markColors('graphite')).toEqual({
      tile: 'oklch(0.9 0.01 260)',
      tree: 'oklch(0.2 0.01 260)',
    });
  });
});
