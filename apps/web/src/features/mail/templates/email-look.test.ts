import { colorThemes } from '@/shared/theme/color-themes';
import { surfaceStyles } from '@/shared/theme/surface-styles';
import { themePalette } from '@/shared/theme/theme-palette';

import { emailLook } from './email-look';
import { renderEmail } from './layout';

const hex = /^#[0-9a-f]{6}$/;
const content = {
  title: 'Welcome',
  preheader: 'Preview',
  paragraphs: ['Body.'],
  action: { label: 'Open', url: 'https://canopy.example/x' },
  footer: 'Footer.',
};

describe('email look', () => {
  it.each(surfaceStyles)('gives the %s surface plain colours a mail client reads', (surface) => {
    const look = emailLook(surface, themePalette('canopy'));
    expect(look.page).toMatch(hex);
    expect(look.text).toMatch(hex);
    expect(look.button.background).toMatch(hex);
    const { html } = renderEmail('Subject', content, look);
    expect(html).not.toContain('var(--');
    expect(html).not.toContain('oklch(');
    expect(html).toContain(look.button.background);
  });

  it('takes the accent from the colour theme', () => {
    const rose = emailLook('solid', themePalette('rose'));
    const canopy = emailLook('solid', themePalette('canopy'));
    expect(rose.button.background).not.toBe(canopy.button.background);
    expect(
      colorThemes.map((theme) => emailLook('glass', themePalette(theme)).pageImage),
    ).toHaveLength(colorThemes.length);
  });

  it('draws each surface its own way', () => {
    const palette = themePalette('violet');
    const cyberpunk = emailLook('cyberpunk', palette);
    expect(cyberpunk.headingCase).toBe('uppercase');
    expect(renderEmail('S', content, cyberpunk).html).toContain('height:3px');
    const bento = renderEmail('S', content, emailLook('bento', palette)).html;
    // The title sits in its own tinted tile, once.
    expect(bento.match(/<h1/g)).toHaveLength(1);
    expect(bento).toContain('border-radius:24px');
    expect(emailLook('minimal', palette).button.border).toBe(
      emailLook('minimal', palette).button.color,
    );
    expect(renderEmail('S', content, emailLook('glass', palette)).html).toContain(
      'linear-gradient',
    );
    expect(renderEmail('S', content, emailLook('flat', palette)).html).toContain(
      'padding:6px 12px',
    );
  });
});
