import { expect, test } from '@playwright/test';

import { nextStepCode, totpCode } from './fixtures/totp';
import { createUser, signInAs } from './fixtures/users';

test('two-factor: turn it on, then sign in with a code', async ({ page, browser, isMobile }) => {
  test.skip(isMobile, 'Same flow on every screen; covered on desktop.');
  // Waits up to one 30 s step so the sign-in code is not the one used to turn it on.
  test.setTimeout(90_000);
  const username = `totp-${String(Date.now())}`;
  const password = 'e2e-totp-passphrase';
  await createUser(page, username, password);

  const first = await signInAs(browser, username, password);
  await first.page.goto('/account');
  await first.page.getByRole('button', { name: 'Set up' }).click();
  const secret = (
    await first.page
      .locator('code')
      .filter({ hasText: /^[A-Z2-7]+=*$/ })
      .innerText()
  ).trim();
  const enrolledAt = Date.now();
  await first.page.getByLabel('Code from the app').fill(totpCode(secret, enrolledAt));
  await first.page.getByRole('button', { name: 'Turn on' }).click();
  await expect(first.page.getByRole('heading', { name: 'Save your recovery codes' })).toBeVisible();
  await first.page.getByRole('button', { name: 'I saved them' }).click();
  await first.context.close();

  const second = await signInAs(browser, username, password);
  await expect(second.page).toHaveURL(/\/login\/verify$/);
  // A wrong code is refused before the right one gets in.
  await second.page.getByLabel('Authentication code').fill('000000');
  await second.page.getByRole('button', { name: 'Verify' }).click();
  await expect(
    second.page.getByRole('alert').filter({ hasText: 'This code is not valid' }),
  ).toBeVisible();
  await second.page.getByLabel('Authentication code').fill(await nextStepCode(secret, enrolledAt));
  await second.page.getByRole('button', { name: 'Verify' }).click();
  await expect(second.page.getByRole('heading', { level: 1, name: 'Files' })).toBeVisible();
  await second.context.close();
});
