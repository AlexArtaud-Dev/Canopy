import { expect, test } from '@playwright/test';

// The admin (setup project session) creates a user without any role, who is then refused.
test('a user without permissions sees the access-denied state', async ({ page, browser }) => {
  const username = `norole-${String(Date.now())}`;
  const password = 'e2e-norole-passphrase';

  await page.goto('/admin/users');
  await page.getByRole('button', { name: 'New user' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Username').fill(username);
  await dialog.getByLabel('Display name').fill('No Role');
  await dialog.getByLabel('Password', { exact: true }).fill(password);
  await dialog.getByLabel('Confirm password').fill(password);
  await dialog.getByRole('button', { name: 'Create user' }).click();
  await expect(page.getByRole('cell', { name: new RegExp(username) })).toBeVisible();

  const visitor = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const userPage = await visitor.newPage();
  await userPage.goto('/login');
  await userPage.getByLabel('Username').fill(username);
  await userPage.getByLabel('Password', { exact: true }).fill(password);
  await userPage.getByRole('button', { name: 'Sign in' }).click();
  await expect(userPage.getByRole('heading', { level: 1, name: 'Files' })).toBeVisible();

  await userPage.goto('/admin/users');
  await expect(userPage.getByRole('heading', { level: 1, name: 'Access denied' })).toBeVisible();
  await visitor.close();
});
