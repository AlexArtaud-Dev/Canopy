import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { colorThemes } from './color-themes';
import { surfaceStyles } from './surface-styles';

const themeDir = path.join(process.cwd(), 'src', 'shared', 'theme');
const globals = readFileSync(path.join(process.cwd(), 'src', 'app', 'globals.css'), 'utf8');

/** A theme or surface that is offered but never styled would silently look like the default. */
describe('theme files', () => {
  it.each(colorThemes.filter((theme) => theme !== 'canopy'))(
    'styles the %s colour theme in light and dark',
    (theme) => {
      const file = path.join(themeDir, 'themes', `${theme}.css`);
      expect(existsSync(file)).toBe(true);
      const css = readFileSync(file, 'utf8');
      expect(css).toContain(`:root[data-theme='${theme}'] {`);
      expect(css).toContain(`:root[data-theme='${theme}'].dark {`);
      expect(globals).toContain(`@import '../shared/theme/themes/${theme}.css';`);
    },
  );

  it.each(surfaceStyles.filter((surface) => surface !== 'solid'))(
    'styles the %s surface',
    (surface) => {
      const file = path.join(themeDir, 'surfaces', `${surface}.css`);
      expect(readFileSync(file, 'utf8')).toContain(`:root[data-surface='${surface}']`);
      expect(globals).toContain(`@import '../shared/theme/surfaces/${surface}.css';`);
    },
  );
});
