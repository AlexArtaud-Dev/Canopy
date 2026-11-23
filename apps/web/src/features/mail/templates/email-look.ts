import { mixHex, oklchToHex } from '@/shared/theme/oklch';
import type { SurfaceStyle } from '@/shared/theme/surface-styles';
import type { ThemePalette } from '@/shared/theme/theme-palette';

/**
 * How an e-mail looks: the instance's colour theme and surface, turned into plain values mail
 * clients understand (hex colours, inline styles; gradients and shadows degrade to flat colours
 * where a client drops them).
 */
export interface EmailLook {
  page: string;
  /** A background image over `page` (gradients); clients that drop it keep the page colour. */
  pageImage: string | null;
  card: string;
  cardBorder: string | null;
  cardRadius: number;
  cardShadow: string | null;
  /** A coloured bar along the top of the card. */
  cardTopBar: string | null;
  /** A tinted tile holding the title, above the card (bento). */
  titleTile: string | null;
  text: string;
  muted: string;
  font: string;
  headingFont: string;
  headingCase: 'none' | 'uppercase';
  headingWeight: number;
  brand: { color: string; background: string | null; label: string };
  button: {
    background: string;
    color: string;
    border: string | null;
    radius: number;
    glow: string | null;
  };
}

const sans = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;
const mono = `ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace`;

export function emailLook(surface: SurfaceStyle, palette: ThemePalette): EmailLook {
  const accent = oklchToHex(palette.primary);
  const neon = oklchToHex(palette.primaryDark);
  const onNeon = oklchToHex(palette.onPrimaryDark);
  const second = oklchToHex(palette.second);
  const fourth = oklchToHex(palette.fourth);
  const white = '#ffffff';
  const solid: EmailLook = {
    page: '#f5f5f4',
    pageImage: null,
    card: white,
    cardBorder: '#e7e5e4',
    cardRadius: 12,
    cardShadow: null,
    cardTopBar: null,
    titleTile: null,
    text: '#1c1917',
    muted: '#57534e',
    font: sans,
    headingFont: sans,
    headingCase: 'none',
    headingWeight: 700,
    brand: { color: '#1c1917', background: null, label: 'Canopy' },
    button: { background: accent, color: white, border: null, radius: 8, glow: null },
  };
  switch (surface) {
    case 'solid':
      return solid;
    case 'glass':
      return {
        ...solid,
        page: mixHex(accent, white, 0.12),
        pageImage: `linear-gradient(135deg,${mixHex(accent, white, 0.24)} 0%,${mixHex(second, white, 0.2)} 50%,${mixHex(fourth, white, 0.22)} 100%)`,
        cardBorder: 'rgba(255,255,255,0.9)',
        cardRadius: 20,
        cardShadow: '0 12px 32px rgba(15,23,42,0.12)',
        brand: { color: accent, background: 'rgba(255,255,255,0.7)', label: 'Canopy' },
        button: { ...solid.button, radius: 999 },
      };
    case 'cyberpunk': {
      const night = '#0b0a17';
      const panel = '#13112a';
      return {
        ...solid,
        page: night,
        pageImage: `linear-gradient(180deg,${mixHex(neon, night, 0.22)} 0%,${night} 55%)`,
        card: panel,
        cardBorder: mixHex(neon, panel, 0.5),
        cardRadius: 2,
        cardShadow: `0 0 28px ${mixHex(neon, night, 0.35)}`,
        cardTopBar: neon,
        text: '#ebe9ff',
        muted: '#aaa6cc',
        headingFont: mono,
        headingCase: 'uppercase',
        brand: { color: neon, background: null, label: 'CANOPY //' },
        button: {
          background: neon,
          color: onNeon,
          border: null,
          radius: 2,
          glow: `0 0 18px ${neon}`,
        },
      };
    }
    case 'bento':
      return {
        ...solid,
        page: '#efeff2',
        card: white,
        cardBorder: null,
        cardRadius: 24,
        titleTile: mixHex(accent, white, 0.16),
        headingWeight: 650,
        button: { ...solid.button, radius: 14 },
      };
    case 'flat':
      return {
        ...solid,
        page: white,
        card: '#f1f1f3',
        cardBorder: null,
        cardRadius: 4,
        brand: { color: white, background: accent, label: 'Canopy' },
        button: { ...solid.button, radius: 4 },
      };
    case 'minimal':
      return {
        ...solid,
        page: white,
        cardBorder: '#e9e9ec',
        cardRadius: 6,
        text: '#18181b',
        muted: '#5f5f69',
        headingWeight: 500,
        button: { background: white, color: accent, border: accent, radius: 6, glow: null },
      };
  }
}
