import { Script } from 'node:vm';

import {
  appIcons,
  buildManifest,
  findAppIcon,
  linkedStylesheets,
  splashBackground,
} from './pwa.utils';
import { offlineCacheName, offlinePath, serviceWorkerSource } from './service-worker-source';

const texts = { description: 'File manager', files: 'Files', shares: 'Shares', commands: 'Run' };

describe('manifest', () => {
  const manifest = buildManifest(texts, 'fr');

  it('opens Canopy full screen from the root, in the person language', () => {
    expect(manifest).toMatchObject({
      id: '/',
      name: 'Canopy',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      lang: 'fr',
      description: 'File manager',
      background_color: splashBackground,
      theme_color: splashBackground,
    });
  });

  it('lists every icon, a maskable one among them', () => {
    expect(manifest.icons).toHaveLength(appIcons.length);
    expect(manifest.icons).toContainEqual({
      src: '/app-icons/maskable-512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    });
    expect(manifest.icons?.filter((icon) => icon.purpose === 'any')).toHaveLength(2);
  });

  it('offers shortcuts to files, shares and commands', () => {
    expect(manifest.shortcuts?.map((shortcut) => [shortcut.name, shortcut.url])).toEqual([
      ['Files', '/'],
      ['Shares', '/shares'],
      ['Run', '/commands'],
    ]);
  });

  it('finds icons by file name only', () => {
    expect(findAppIcon('icon-192.png')?.size).toBe(192);
    expect(findAppIcon('../secret.png')).toBeUndefined();
  });
});

describe('offline page styles', () => {
  it('keeps the same-origin stylesheets a page links, in any attribute order', () => {
    const html = [
      '<link rel="stylesheet" href="/_next/static/css/a.css" data-precedence="next"/>',
      "<link href='/_next/static/css/b.css' rel='stylesheet'>",
      '<link rel="preload" href="/font.woff2" as="font">',
      '<link rel="stylesheet" href="https://elsewhere.example/c.css">',
      '<link rel="stylesheet">',
    ].join('');
    expect(linkedStylesheets(html)).toEqual(['/_next/static/css/a.css', '/_next/static/css/b.css']);
    expect(linkedStylesheets('<p>no links</p>')).toEqual([]);
  });
});

describe('service worker', () => {
  const source = serviceWorkerSource();

  it('keeps the offline page in its own cache and answers failed navigations with it', () => {
    expect(source).toContain(JSON.stringify(offlineCacheName));
    expect(source).toContain(JSON.stringify(offlinePath));
    expect(source).toContain("request.mode !== 'navigate'");
  });

  it('is a script on its own (the stylesheet reader is inlined)', () => {
    // Compiled, not run: a syntax error in the template would break every installed app.
    expect(() => new Script(source)).not.toThrow();
    expect(source).toContain('const linkedStylesheets = ');
  });
});
