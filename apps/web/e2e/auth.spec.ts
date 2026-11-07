import { expect, test } from '@playwright/test';

import { testAdmin } from './fixtures/admin';

// Signed-out visitor: start without the administrator's session.
test.use({ storageState: { cookies: [], origins: [] } });

test('protected pages send visitors to sign in, then back where they were', async ({ page }) => {
  await page.goto('/system');
  await expect(page).toHaveURL(/\/login\?next=%2Fsystem$/);
  await expect(page).toHaveTitle('Sign in · Canopy');

  await page.getByLabel('Username').fill(testAdmin.username);
  await page.getByLabel('Password', { exact: true }).fill(testAdmin.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/system$/);
});

test('a wrong password is refused with a translated message', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Username').fill(testAdmin.username);
  await page.getByLabel('Password', { exact: true }).fill('not-the-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Could not sign in' })).toContainText(
    'Incorrect username or password.',
  );
  await expect(page).toHaveURL(/\/login$/);
});

test('the setup wizard is closed once an administrator exists', async ({ page }) => {
  await page.goto('/setup');
  await expect(page).toHaveURL(/\/login$/);
});

test('signing out ends the session', async ({ page, isMobile }) => {
  await page.goto('/login');
  await page.getByLabel('Username').fill(testAdmin.username);
  await page.getByLabel('Password', { exact: true }).fill(testAdmin.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Files' })).toBeVisible();

  if (isMobile) {
    await page.getByRole('button', { name: 'Toggle sidebar' }).click();
  }
  await page.getByRole('button', { name: 'Account and preferences' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
});
