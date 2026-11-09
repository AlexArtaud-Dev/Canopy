import { expect, test, type Page } from '@playwright/test';

/** The volume the stack mounts for tests (CI: docker/data at /data). */
const volume = process.env.E2E_VOLUME ?? 'data';

test.skip(({ isMobile }) => isMobile, 'Right-click flows; touch uses the same menus (long-press).');

const row = (page: Page, name: string) =>
  page.getByRole('option').filter({ has: page.getByText(name, { exact: true }) });

async function openFolder(page: Page, path: string): Promise<void> {
  await page.goto(`/?path=${encodeURIComponent(path)}`);
  await expect(page.getByRole('listbox', { name: `Contents of ${path}` })).toBeVisible();
}

async function newFolder(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'New folder' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(row(page, name)).toBeVisible();
}

async function upload(page: Page, name: string, content: string): Promise<void> {
  await page
    .locator('input[type=file]:not([webkitdirectory])')
    .setInputFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(content) });
  await expect(row(page, name)).toBeVisible();
}

async function menu(page: Page, name: string, item: string | RegExp): Promise<void> {
  await row(page, name).click({ button: 'right' });
  await page.getByRole('menuitem', { name: item }).click();
}

const unique = () => `e2e-${String(Date.now())}-${String(Math.floor(Math.random() * 1000))}`;

test('browse: create a folder, open it, upload a file, go back up', async ({ page }) => {
  const folder = unique();
  await openFolder(page, `/${volume}`);
  await newFolder(page, folder);
  await row(page, folder).dblclick();
  await expect(
    page.getByRole('listbox', { name: `Contents of /${volume}/${folder}` }),
  ).toBeVisible();
  await upload(page, 'hello.txt', 'hello canopy');
  await page
    .getByRole('navigation', { name: 'Folder path' })
    .getByRole('link', { name: volume })
    .click();
  await expect(row(page, folder)).toBeVisible();
});

test('copy and move run as operations and land where asked', async ({ page }) => {
  const folder = unique();
  await openFolder(page, `/${volume}`);
  await newFolder(page, folder);
  await openFolder(page, `/${volume}/${folder}`);
  await newFolder(page, 'inner');
  await upload(page, 'copied.txt', 'copy me');
  await upload(page, 'moved.txt', 'move me');

  await menu(page, 'copied.txt', 'Copy to…');
  const picker = page.getByRole('dialog', { name: 'Copy to…' });
  await picker.getByRole('button', { name: 'inner' }).click();
  await picker.getByRole('button', { name: 'Copy here' }).click();
  await expect(
    page.getByRole('complementary', { name: 'Operations' }).getByText('Done').first(),
  ).toBeVisible();

  await menu(page, 'moved.txt', 'Move to…');
  const mover = page.getByRole('dialog', { name: 'Move to…' });
  await mover.getByRole('button', { name: 'inner' }).click();
  await mover.getByRole('button', { name: 'Move here' }).click();
  await expect(row(page, 'moved.txt')).toBeHidden();
  await expect(row(page, 'copied.txt')).toBeVisible();

  await openFolder(page, `/${volume}/${folder}/inner`);
  await expect(row(page, 'copied.txt')).toBeVisible();
  await expect(row(page, 'moved.txt')).toBeVisible();
});

test('delete goes to the trash and restores', async ({ page }) => {
  const folder = unique();
  await openFolder(page, `/${volume}`);
  await newFolder(page, folder);
  await openFolder(page, `/${volume}/${folder}`);
  await upload(page, 'precious.txt', 'keep me');

  await menu(page, 'precious.txt', /^Delete(?! permanently)/);
  await page.getByRole('alertdialog').getByRole('button', { name: 'Move to trash' }).click();
  await expect(row(page, 'precious.txt')).toBeHidden();

  await page.goto('/trash');
  // Other runs may have left items named the same: restore the newest.
  await page.getByRole('button', { name: 'Restore precious.txt' }).first().click();
  await expect(page.getByText('1 item restored')).toBeVisible();

  await openFolder(page, `/${volume}/${folder}`);
  await expect(row(page, 'precious.txt')).toBeVisible();
});
