import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/shared/i18n/request.ts');

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  typedRoutes: true,
  // postgres.js ships ESM only; transpiling it lets Jest (next/jest) load it. Next already bundles it.
  transpilePackages: ['postgres'],
};

export default withNextIntl(nextConfig);
