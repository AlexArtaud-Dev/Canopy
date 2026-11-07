import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/shared/i18n/request.ts');

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  typedRoutes: true,
  // Spike variant A: plain rewrites to the engine.
  rewrites() {
    return Promise.resolve([
      {
        source: '/engine/:path*',
        destination: `${process.env.CANOPY_ENGINE_URL ?? 'http://localhost:8080'}/:path*`,
      },
    ]);
  },
};

export default withNextIntl(nextConfig);
