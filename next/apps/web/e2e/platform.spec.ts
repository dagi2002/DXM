import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { SEEDED, seedIssues } from './seed';

/**
 * Platform screens: the public pages (landing, shared report) and the fix flow on Today. Fixes
 * are real: the tests seed issues the way the worker's detectors write them (e2e/seed.ts).
 * Replays and reports still run on the flagged sample layer (src/lib/sample.ts).
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
  const siteId = new URL(page.url()).pathname.split('/').at(-1)!;
  await page.goto('/today');
  return siteId;
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

test('a new organization sees an honest empty feed, never sample fixes', async ({ page }, info) => {
  await signUpWithSite(page, info, 'empty');
  await expect(page.getByRole('heading', { name: 'No problems found yet' })).toBeVisible();
  // ("This week" in the side panel is still sample data until slice 5; the fix feed is not.)
  await expect(page.getByRole('tabpanel').getByText('Sample data')).toHaveCount(0);
  await expect(page.getByText('Pay with telebirr')).toHaveCount(0);
});

test('Today → fix detail and back, on real fixes', async ({ page }, info) => {
  const siteId = await signUpWithSite(page, info, 'fixflow');
  const ids = await seedIssues(siteId);
  await page.reload();
  // The critical fix leads, with its evidence and impact.
  await expect(page.getByRole('heading', { level: 3, name: SEEDED.lead })).toBeVisible();
  await expect(page.getByText('31 visitors affected').first()).toBeVisible();
  await expect(page.getByText('≈ 31 visitors / day')).toBeVisible();
  await expect(page.getByRole('tabpanel').getByText('Sample data')).toHaveCount(0);
  // AI is off in e2e: no AI box anywhere.
  await expect(page.getByText('Suggested fix · AI')).toHaveCount(0);
  // The verified fix shows its before/after.
  await expect(page.getByText(/U-turns · share of visits: 36% → 3\.3%/)).toBeVisible();

  await page.getByRole('link', { name: 'Open fix' }).first().click();
  await expect(page).toHaveURL(new RegExp(`/fixes/${ids.lead}$`));
  await expect(page.getByRole('heading', { level: 1, name: SEEDED.lead })).toBeVisible();
  await expect(page.getByText(/Fix #\d+/)).toBeVisible();
  await expect(page.getByText('Suggested fix · AI')).toHaveCount(0);

  await page.getByRole('link', { name: 'Today' }).first().click();
  await expect(page).toHaveURL(/\/today$/);
});

test('marking a fix as fixing moves it from Open to Fixing', async ({ page }, info) => {
  const siteId = await signUpWithSite(page, info, 'fixing');
  await seedIssues(siteId);
  await page.reload();
  const tabs = page.getByRole('tablist', { name: 'Fix status' });
  const list = page.getByRole('tabpanel');

  await expect(tabs.getByRole('tab', { name: /^Open/ })).toHaveAttribute('aria-selected', 'true');
  await expect(list.getByRole('heading', { name: SEEDED.lead })).toBeVisible();
  await expect(tabs.getByRole('tab', { name: /^Fixing/ })).toHaveText('Fixing1');

  await page.getByRole('button', { name: 'Mark as fixing' }).click();
  await expect(list.getByRole('heading', { name: SEEDED.lead })).toHaveCount(0);
  await expect(tabs.getByRole('tab', { name: /^Fixing/ })).toHaveText('Fixing2');

  // It's saved: still Fixing after a reload.
  await page.reload();
  await tabs.getByRole('tab', { name: /^Fixing/ }).click();
  await expect(tabs.getByRole('tab', { name: /^Fixing/ })).toHaveAttribute('aria-selected', 'true');
  await expect(list.getByRole('heading', { name: SEEDED.lead })).toBeVisible();
  await expect(list.getByRole('heading', { name: SEEDED.fixing })).toBeVisible();
});

test('Settings → Notifications says when Telegram is not set up', async ({ page }, info) => {
  await signUpWithSite(page, info, 'telegram');
  await page.goto('/settings?tab=notifications');
  await expect(page.getByRole('tab', { name: 'Notifications' })).toHaveAttribute('aria-selected', 'true');
  await expect(
    page.getByText('Telegram alerts aren’t set up on this server.', { exact: false }),
  ).toBeVisible();
});
