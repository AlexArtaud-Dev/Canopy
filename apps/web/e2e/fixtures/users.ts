import { expect, type Browser, type Page } from '@playwright/test';

/** The administrator (setup project session) creates a user without any role. */
export async function createUser(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/admin/users');
  await page.getByRole('button', { name: 'New user' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Username').fill(username);
  await dialog.getByLabel('Display name').fill(username);
  await dialog.getByLabel('Password', { exact: true }).fill(password);
  await dialog.getByLabel('Confirm password').fill(password);
  await dialog.getByRole('button', { name: 'Create user' }).click();
  await expect(page.getByRole('cell', { name: new RegExp(username) }).first()).toBeVisible();
}

/** A fresh, signed-out browser context signed in as that user. */
export async function signInAs(browser: Browser, username: string, password: string) {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  // Signed in (or asked for the second step) once the sign-in page is left.
  await page.waitForURL((url) => url.pathname !== '/login');
  return { context, page };
}
