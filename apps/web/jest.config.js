import nextJest from 'next/jest.js';

const createJestConfig = nextJest({ dir: './' });

/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  testPathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/e2e/'],
  // Pure logic must stay fully covered; generated shadcn primitives and route files are excluded.
  collectCoverageFrom: [
    'src/**/*.{utils,nav}.ts',
    'src/shared/request/client-ip.ts',
    'src/shared/request/request-id.ts',
    'src/shared/security/csp.ts',
    'src/shared/rate-limit/rate-limit.utils.ts',
    'src/shared/errors/error-key.ts',
    'src/shared/secrets/envelope.ts',
    'src/shared/modules/registry.ts',
    'src/shared/{lib,i18n,config}/**/*.ts',
    '!src/**/*.d.ts',
    '!src/shared/i18n/request.ts',
    '!src/shared/lib/utils.ts',
    // Browser file download (DOM side effect only).
    '!src/shared/lib/download.ts',
  ],
  coverageThreshold: { global: { branches: 100, functions: 100, lines: 100, statements: 100 } },
};

/** Packages shipped as ESM only that SWC must compile for Jest, on top of next.config's list. */
const esmOnlyPackages = [
  'better-auth',
  '@better-auth',
  'better-call',
  '@better-fetch',
  'jose',
  'nanostores',
  '@noble',
  'rou3',
  'defu',
  'kysely',
  'set-cookie-parser',
];

export default async function jestConfig() {
  const resolved = await createJestConfig(config)();
  return {
    ...resolved,
    // next/jest only allow-lists `transpilePackages`; extend its patterns rather than replace them.
    transformIgnorePatterns: resolved.transformIgnorePatterns.map((pattern) =>
      pattern.replaceAll('(postgres|', `(postgres|${esmOnlyPackages.join('|')}|`),
    ),
  };
}
