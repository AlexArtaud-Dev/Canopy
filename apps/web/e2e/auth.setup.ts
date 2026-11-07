import { expect, test as setup } from '@playwright/test';

import { testAdmin } from './fixtures/admin';

// Runs once before the suites: the CI database is empty, so this goes through the first-run
// wizard; on a reused stack the admin already exists and it simply signs in.
setup('create or sign in the administrator', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/(setup|login)/);

  if (page.url().includes('/setup')) {
    await page.getByRole('button', { name: 'Get started' }).click();
    await page.getByLabel('Username').fill(testAdmin.username);
    await page.getByLabel('Display name').fill(testAdmin.displayName);
    await page.getByLabel('Password', { exact: true }).fill(testAdmin.password);
    await page.getByLabel('Confirm password').fill(testAdmin.password);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('heading', { name: "You're all set" })).toBeVisible();
    await page.getByRole('button', { name: 'Open Canopy' }).click();
  } else {
    await page.getByLabel('Username').fill(testAdmin.username);
    await page.getByLabel('Password', { exact: true }).fill(testAdmin.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
  }

  await expect(page.getByRole('heading', { level: 1, name: 'Files' })).toBeVisible();
  await page.context().storageState({ path: 'e2e/.auth/admin.json' });
});
