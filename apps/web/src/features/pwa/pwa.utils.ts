import type { MetadataRoute } from 'next';

/**
 * Colours of the installed app's splash screen and title bar. A manifest cannot read the CSS
 * tokens, so these repeat the default theme's background (light) as hex.
 */
export const splashBackground = '#ffffff';

/** The icons the manifest lists, served by `/app-icons/<file>`. */
export const appIcons = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'maskable-512.png', size: 512, maskable: true },
] as const;

export type AppIconFile = (typeof appIcons)[number]['file'];

export function findAppIcon(file: string): (typeof appIcons)[number] | undefined {
  return appIcons.find((icon) => icon.file === file);
}

/** What the manifest says in the person's language. */
export interface ManifestTexts {
  description: string;
  files: string;
  shares: string;
  commands: string;
}

/**
 * The web app manifest: Canopy opens full screen from its own icon, with shortcuts to the
 * places people go to first.
 */
export function buildManifest(texts: ManifestTexts, lang: string): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Canopy',
    short_name: 'Canopy',
    description: texts.description,
    lang,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: splashBackground,
    theme_color: splashBackground,
    icons: appIcons.map((icon) => ({
      src: `/app-icons/${icon.file}`,
      sizes: `${icon.size}x${icon.size}`,
      type: 'image/png',
      purpose: icon.maskable ? 'maskable' : 'any',
    })),
    shortcuts: [
      { name: texts.files, url: '/' },
      { name: texts.shares, url: '/shares' },
      { name: texts.commands, url: '/commands' },
    ],
  };
}

/** Stylesheets an HTML page links, so that the offline page keeps its look without a network. */
export function linkedStylesheets(html: string): string[] {
  const links = html.match(/<link\b[^>]*>/gi) ?? [];
  return links.flatMap((link) => {
    if (!/\brel=["']?stylesheet\b/i.test(link)) return [];
    const href = /\bhref=["']([^"']+)["']/i.exec(link)?.[1];
    return href?.startsWith('/') ? [href] : [];
  });
}
