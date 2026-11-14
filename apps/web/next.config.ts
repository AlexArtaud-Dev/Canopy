import { readFileSync } from 'node:fs';

import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { z } from 'zod';

import { staticSecurityHeaders } from './src/shared/security/csp';

const withNextIntl = createNextIntlPlugin('./src/i18n.request.ts');

/**
 * Each release is a deployment: a tab opened on an older one is hard-reloaded on its next
 * navigation instead of calling server actions the new server no longer knows.
 */
const { version } = z
  .object({ version: z.string().min(1) })
  .parse(JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')));

const nextConfig: NextConfig = {
  output: 'standalone',
  deploymentId: version,
  poweredByHeader: false,
  reactStrictMode: true,
  typedRoutes: true,
  // Dev logging prints server action arguments, which include passwords.
  logging: { serverFunctions: false },
  // postgres.js ships ESM only; transpiling it lets Jest (next/jest) load it. Next already bundles it.
  transpilePackages: ['postgres'],
  // Thumbnails and previews come from the engine already sized: no image optimizer (the image
  // build drops sharp, which Next.js would otherwise ship).
  images: { unoptimized: true },
  headers() {
    return Promise.resolve([{ source: '/:path*', headers: [...staticSecurityHeaders] }]);
  },
};

export default withNextIntl(nextConfig);
