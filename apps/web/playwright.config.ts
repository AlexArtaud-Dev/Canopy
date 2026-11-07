import { defineConfig, devices } from '@playwright/test';

const adminStorageState = 'e2e/.auth/admin.json';

// E2E runs against an already running stack (CI: docker/compose.yaml); it never starts servers.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000',
    locale: 'en-US',
    trace: 'retain-on-failure',
  },
  projects: [
    // Creates (or signs in) the administrator once; the other projects reuse its session.
    { name: 'setup', testMatch: /auth\.setup\.ts$/, use: { ...devices['Desktop Chrome'] } },
    {
      name: 'desktop',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: adminStorageState },
    },
    {
      name: 'mobile',
      dependencies: ['setup'],
      use: { ...devices['Pixel 7'], storageState: adminStorageState },
    },
  ],
});
