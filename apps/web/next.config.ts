import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

import { staticSecurityHeaders } from './src/shared/security/csp';

const withNextIntl = createNextIntlPlugin('./src/i18n.request.ts');

const nextConfig: NextConfig = {
  output: 'standalone',
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
