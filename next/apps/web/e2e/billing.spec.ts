import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { useUpSessionQuota } from './seed';

/**
 * Slice 7: Settings → Billing for an owner on a server with no Chapa keys (the e2e stack has
 * none, so no payment can be made): the quota notice, the free trial, and the first invoice.
 */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function expectAccessible(page: Page, label: string) {
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await page.addStyleTag({
      content: '*, *::before, *::after { transition: none !important; animation: none !important; }',
    });
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    const results = await new AxeBuilder({ page })
      .withTags(TAGS)
      .exclude('[role="log"][aria-live]')
      .analyze();
    const violations = results.violations.map(
      (v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
    );
    expect(violations, `axe violations on ${label} (${colorScheme})`).toEqual([]);
  }
  await page.emulateMedia({ colorScheme: 'light' });
}

test('an owner sees the quota notice, starts a trial and gets the first invoice', async ({ page }, info) => {
  test.setTimeout(90_000);
  const orgName = `Billing ${info.project.name} ${Date.now()}`;
  await page.goto('/sign-up');
  await page.getByRole('radio', { name: 'EN' }).check({ force: true });
  await page.getByLabel('Your name').fill('Tigist Haile');
  await page.getByLabel('Email').fill(`billing-${info.project.name}-${Date.now()}@example.et`);
  await page.getByLabel('Password', { exact: true }).fill('e2e passphrase long enough');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByLabel('Organization name').fill(orgName);
  await page.getByRole('button', { name: 'Create organization' }).click();
  await page.getByRole('button', { name: 'Add a site' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a site' });
  await dialog.getByLabel('Site name').fill('Demo shop');
  await dialog.getByLabel('Domain').fill(`billing-${info.project.name}-${Date.now()}.example.et`);
  await dialog.getByRole('button', { name: 'Add site' }).click();
  await expect(page).toHaveURL(/\/sites\/site_/);

  // The free plan's sessions run out: Today and Replays say so plainly.
  await useUpSessionQuota(orgName);
  await page.goto('/today');
  await expect(page.getByText('This month’s sessions are used up')).toBeVisible();
  await expect(page.getByText('New sessions are not being stored', { exact: false })).toBeVisible();
  await page.goto('/replays');
  await expect(page.getByText('This month’s sessions are used up')).toBeVisible();
  await page.getByRole('link', { name: 'Open Billing' }).click();

  // Settings → Billing: real plan and usage, and an honest "not set up" instead of a pay button.
  await expect(page).toHaveURL(/tab=billing/);
  await expect(page.getByRole('tab', { name: 'Billing' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'Your plan: Free' })).toBeVisible();
  await expect(page.getByText('Online payment isn’t set up on this server')).toBeVisible();
  await expect(page.getByTestId('billing-sessions')).toHaveText('1,000 of 1,000');
  await expect(page.getByText('No invoices yet.')).toBeVisible();
  await expectAccessible(page, 'billing (free, over quota)');

  // Start the Business trial: the plan, the quota and the notice all change at once.
  const business = page.getByTestId('billing-plan-business');
  await expect(business.getByText('ETB 2,400')).toBeVisible();
  await business.getByRole('button', { name: 'Start 14-day free trial' }).click();
  await expect(page.getByRole('heading', { name: 'Your plan: Business' })).toBeVisible();
  await expect(page.getByText('Free trial', { exact: true })).toBeVisible();
  await expect(page.getByTestId('billing-sessions')).toHaveText('0 of 15,000');
  await expect(page.getByText('This month’s sessions are used up')).toHaveCount(0);

  // Ask for the first invoice. Money shows in birr; with no keys there is nothing to click to pay.
  await business.getByRole('button', { name: 'Get the next invoice now' }).click();
  const invoice = page.getByTestId('billing-invoice');
  await expect(invoice).toHaveCount(1);
  await expect(invoice).toContainText('#1');
  await expect(invoice).toContainText('ETB 2,400');
  await expect(invoice).toContainText('To pay');
  await expect(page.getByRole('button', { name: 'Pay with Chapa' })).toHaveCount(0);
  // Yearly prices: 10 months for 12.
  await page.getByRole('radio', { name: 'Yearly' }).check({ force: true });
  await expect(business.getByText('ETB 24,000')).toBeVisible();
  await expectAccessible(page, 'billing (trial, invoice)');

  // Today no longer warns.
  await page.goto('/today');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByText('This month’s sessions are used up')).toHaveCount(0);

  // Amharic.
  await page.getByRole('radio', { name: 'አማ' }).first().check({ force: true });
  await expect(page.locator('html')).toHaveAttribute('lang', 'am');
  await page.goto('/settings?tab=billing');
  await expect(page.getByRole('tab', { name: 'ክፍያ' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'የእርስዎ ዕቅድ፦ ቢዝነስ' })).toBeVisible();
  await expect(page.getByTestId('billing-invoice')).toContainText('2,400 ብር');
  await expectAccessible(page, 'billing (am)');
});
