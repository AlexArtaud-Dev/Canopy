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

/** Where the phone's share sheet posts files; the service worker answers it. */
export const shareTargetPath = '/share-target';

/** The cache holding files shared from the phone until the person puts them in a folder. */
export const sharedFilesCacheName = 'canopy-shared-files';

/** The header carrying a shared file's name (encoded: names are not header-safe). */
export const sharedFileNameHeader = 'x-canopy-file-name';

/** The cache key of the n-th shared file, in the order the phone sent them. */
export function sharedFileKey(index: number): string {
  return `/shared-files/${index}`;
}

/** The order of a shared file from its cache key; -1 for anything else. */
export function sharedFileIndex(url: string): number {
  const match = /\/shared-files\/(\d+)$/.exec(url);
  return match ? Number(match[1]) : -1;
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
    // Android lists Canopy in the share sheet once installed; the service worker keeps the files.
    share_target: {
      action: shareTargetPath,
      method: 'POST',
      enctype: 'multipart/form-data',
      params: { files: [{ name: 'files', accept: ['*/*'] }] },
    },
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
