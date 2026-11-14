import type { MetadataRoute } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';

import { buildManifest } from '@/features/pwa/pwa.utils';

/** Served at `/manifest.webmanifest`, in the visitor's language. */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const [locale, common, nav] = await Promise.all([
    getLocale(),
    getTranslations('common'),
    getTranslations('shell.nav'),
  ]);
  return buildManifest(
    {
      description: common('meta.description'),
      files: nav('files'),
      shares: nav('shares'),
      commands: nav('commands'),
    },
    locale,
  );
}
