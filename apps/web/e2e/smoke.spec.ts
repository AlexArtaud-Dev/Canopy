import { expect, test } from '@playwright/test';

test('files page renders the shell and the empty state', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Files · Canopy');
  await expect(page.getByRole('heading', { level: 1, name: 'Files' })).toBeVisible();
  await expect(page.getByText('No volumes yet')).toBeVisible();
});

test('system page reports every service operational', async ({ page }) => {
  await page.goto('/system');
  const services = page.getByRole('list', { name: 'Services' }).getByRole('listitem');
  await expect(services).toHaveCount(3);
  for (const service of await services.all()) {
    await expect(service.getByText('Operational')).toBeVisible();
  }
});

test('navigation reaches the system page and marks it active', async ({ page, isMobile }) => {
  await page.goto('/');
  if (isMobile) {
    await page.getByRole('button', { name: 'Toggle sidebar' }).click();
  }
  await page.getByRole('link', { name: 'System status' }).click();
  await expect(page).toHaveURL(/\/system$/);
  if (isMobile) {
    // The mobile sheet closes itself once a destination is picked.
    await expect(page.getByRole('dialog')).toBeHidden();
  } else {
    await expect(page.getByRole('link', { name: 'System status' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  }
});

test('language preference switches the UI to French', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Preferences live in the sidebar footer; covered on desktop.');
  await page.goto('/');
  await page.getByRole('button', { name: /Preferences/ }).click();
  await page.getByRole('menuitemradio', { name: 'Français' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Fichiers' })).toBeVisible();
});
