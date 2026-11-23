import { colorThemes } from './color-themes';
import { themePalette } from './theme-palette';

describe('theme palette', () => {
  it('follows each theme token file', () => {
    expect(themePalette('canopy')).toEqual({
      primary: [0.47, 0.09, 162],
      primaryDark: [0.76, 0.11, 162],
      onPrimaryDark: [0.22, 0.04, 162],
      second: [0.55, 0.08, 200],
      fourth: [0.58, 0.1, 280],
    });
    expect(themePalette('sunset').second).toEqual([0.6, 0.12, 350]);
    expect(themePalette('graphite')).toMatchObject({
      primary: [0.29, 0.01, 260],
      second: [0.62, 0.03, 230],
    });
  });

  it.each(colorThemes)('gives %s a full palette', (theme) => {
    expect(Object.keys(themePalette(theme))).toHaveLength(5);
  });
});
