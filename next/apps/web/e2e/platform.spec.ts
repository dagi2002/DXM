import { expect, test, type Page, type TestInfo } from '@playwright/test';

/**
 * Slice 2.5 platform screens: the public pages (landing, shared report) and the fix flow on
 * Today. Fixes (until an org has real ones) and reports run on the flagged sample layer (src/lib/sample.ts), so these
 * tests pin the screens' behavior, not real detection.
 */

async function signUpWithSite(page: Page, info: TestInfo, tag: string) {
  await page.goto('/sign-up');
  await page.getByRole('radio', { name: 'EN' }).check({ force: true });
  await page.getByLabel('Your name').fill('Tigist Haile');
  await page.getByLabel('Email').fill(`${tag}-${info.project.name}-${Date.now()}@example.et`);
  await page.getByLabel('Password', { exact: true }).fill('e2e passphrase long enough');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByLabel('Organization name').fill('Abebe Furniture');
  await page.getByRole('button', { name: 'Create organization' }).click();
  await expect(page).toHaveURL(/\/today$/);
  // The fix feed appears once the organization has a site.
  await page.getByRole('button', { name: 'Add a site' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a site' });
  await dialog.getByLabel('Site name').fill('Demo shop');
  await dialog.getByLabel('Domain').fill(`${tag}-${info.project.name}-${Date.now()}.example.et`);
  await dialog.getByRole('button', { name: 'Add site' }).click();
  await expect(page).toHaveURL(/\/sites\/[^/]+$/);
  await page.goto('/today');
}

test('landing page at / when signed out, and at /welcome', async ({ page }) => {
  const title = 'See what’s costing you customers this week — and prove it’s fixed.';

  await page.goto('/');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Start free' }).first()).toBeVisible();

  await page.goto('/welcome');
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await page.getByRole('link', { name: 'Start free' }).first().click();
  await expect(page).toHaveURL(/\/sign-up/);
});

test('signed in, / goes to Today but /welcome still shows the landing page', async ({ page }, info) => {
  await signUpWithSite(page, info, 'landing');
  await page.goto('/');
  await expect(page).toHaveURL(/\/today$/);
  await page.goto('/welcome');
  await expect(page.getByRole('heading', { level: 1, name: /costing you customers/ })).toBeVisible();
});

test('public report opens without signing in', async ({ page }) => {
  await page.goto('/r/demo-september');
  await expect(page).toHaveURL(/\/r\/demo-september$/);
  await expect(page.getByText(/Shared report · read-only/)).toBeVisible();
  await expect(page.getByText('We fixed 4 problems this month.', { exact: false })).toBeVisible();
  await expect(page.getByText('Broken link from the Telegram channel')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download PDF' })).toBeVisible();

  await page.goto('/r/no-such-token');
  await expect(page).toHaveURL(/\/r\/no-such-token$/);
  await expect(page.getByText('This link has expired or was turned off.', { exact: false })).toBeVisible();
});

test('Today → fix detail', async ({ page }, info) => {
  await signUpWithSite(page, info, 'fixflow');
  const fixTitle = 'The “Pay with telebirr” button doesn’t respond on Android';
  await expect(page.getByRole('heading', { level: 3, name: fixTitle })).toBeVisible();
  await expect(page.getByText('Sample data').first()).toBeVisible();

  await page.getByRole('link', { name: 'Open fix' }).first().click();
  await expect(page).toHaveURL(/\/fixes\/fix_128$/);
  await expect(page.getByRole('heading', { level: 1, name: fixTitle })).toBeVisible();
  await expect(page.getByText('Fix #128')).toBeVisible();

  // Sample fixes have no recordings; real replays are covered end to end in replays.spec.ts.
  await expect(page.getByRole('link', { name: 'Play from the moment' })).toHaveCount(0);
});

test('marking a fix as fixing moves it from Open to Fixing', async ({ page }, info) => {
  await signUpWithSite(page, info, 'fixing');
  const fixTitle = 'The “Pay with telebirr” button doesn’t respond on Android';
  const tabs = page.getByRole('tablist', { name: 'Fix status' });
  const list = page.getByRole('tabpanel');

  await expect(tabs.getByRole('tab', { name: /^Open/ })).toHaveAttribute('aria-selected', 'true');
  await expect(list.getByRole('heading', { name: fixTitle })).toBeVisible();
  await expect(tabs.getByRole('tab', { name: /^Fixing/ })).toHaveText('Fixing1');

  await page.getByRole('button', { name: 'Mark as fixing' }).click();
  await expect(list.getByRole('heading', { name: fixTitle })).toHaveCount(0);
  await expect(tabs.getByRole('tab', { name: /^Fixing/ })).toHaveText('Fixing2');

  await tabs.getByRole('tab', { name: /^Fixing/ }).click();
  await expect(tabs.getByRole('tab', { name: /^Fixing/ })).toHaveAttribute('aria-selected', 'true');
  await expect(list.getByRole('heading', { name: fixTitle })).toBeVisible();
});
