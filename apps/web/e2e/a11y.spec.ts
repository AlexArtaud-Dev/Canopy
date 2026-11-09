import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// WCAG 2.2 AA (and the A and 2.0/2.1 rules it includes), checked with axe on every main page.
const wcag = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const pages: { path: string; heading: string }[] = [
  { path: '/', heading: 'Files' },
  { path: '/trash', heading: 'Trash' },
  { path: '/shares', heading: 'Shares' },
  { path: '/commands', heading: 'Commands' },
  { path: '/whats-new', heading: "What's new" },
  { path: '/account', heading: 'Account' },
  { path: '/admin/users', heading: 'Users' },
  { path: '/admin/groups', heading: 'Groups' },
  { path: '/admin/roles', heading: 'Roles' },
  { path: '/admin/settings', heading: 'Settings' },
  { path: '/admin/email', heading: 'Email' },
  { path: '/admin/plugins', heading: 'Plugins' },
  { path: '/admin/audit', heading: 'Audit log' },
  { path: '/system', heading: 'System status' },
];

async function violations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(wcag).analyze();
  return results.violations.map((violation) => ({
    rule: violation.id,
    impact: violation.impact,
    targets: violation.nodes.map((node) => node.target.join(' ')).slice(0, 5),
  }));
}

for (const { path, heading } of pages) {
  test(`${path} meets WCAG 2.2 AA`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });
}

test.describe('signed out', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('/login meets WCAG 2.2 AA', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });
});
