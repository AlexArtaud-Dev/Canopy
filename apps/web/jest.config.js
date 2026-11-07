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
    'src/shared/errors/error-key.ts',
    'src/shared/{lib,i18n,config}/**/*.ts',
    '!src/**/*.d.ts',
    '!src/shared/i18n/request.ts',
    '!src/shared/lib/utils.ts',
  ],
  coverageThreshold: { global: { branches: 100, functions: 100, lines: 100, statements: 100 } },
};

export default createJestConfig(config);
