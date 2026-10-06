import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { COLLECTOR_URL, DEMO_URL } from '../playwright.config';

/**
 * The slice-2 promise: from sign-up to a verified live site in minutes, with real data crossing
 * origins from a customer website (sendBeacon and keepalive fetch enabled — the legacy app's
 * e2e disabled sendBeacon and hid its data-loss bug).
 */
test('install → first visit from the customer site → live, with numbers on Today', async ({
  page,
  context,
}, info) => {
  await page.goto('/sign-up');
  await page.getByRole('radio', { name: 'EN' }).check({ force: true });
  await page.getByLabel('Your name').fill('Tigist Haile');
  await page.getByLabel('Email').fill(`install-${info.project.name}-${Date.now()}@example.et`);
  await page.getByLabel('Password', { exact: true }).fill('e2e passphrase long enough');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByLabel('Organization name').fill('Abebe Furniture');
  await page.getByRole('button', { name: 'Create organization' }).click();
  await page.getByRole('button', { name: 'Add a site' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a site' });
  await dialog.getByLabel('Site name').fill('Demo shop');
  await dialog.getByLabel('Domain').fill(`demo-${info.project.name}.example.et`);
  await dialog.getByRole('button', { name: 'Add site' }).click();

  // Install screen: snippet + waiting state.
  await expect(page.getByText('Waiting for the first visit…')).toBeVisible();
  const snippet = (await page.getByLabel('Install tracking').textContent()) ?? '';
  expect(snippet).toContain(`${COLLECTOR_URL}/sdk/p.js`);
  const key = snippet.match(/data-site="([^"]+)"/)?.[1];
  expect(key).toMatch(/^pk_/);

  // Allow the demo site's origin (stand-in for the customer's real domain).
  await page.getByLabel('Also accept data from').fill(DEMO_URL);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();

  // A visitor on the customer's site.
  const shop = await context.newPage();
  await shop.goto(
    `${DEMO_URL}/?k=${key}&c=${encodeURIComponent(COLLECTOR_URL)}&utm_source=telegram&email=leak@x.et`,
  );
  await expect
    .poll(() => shop.evaluate(() => (window as unknown as { dxm?: { loaded?: boolean } }).dxm?.loaded))
    .toBe(true);
  await shop.getByRole('button', { name: 'Add to cart' }).click();
  for (let i = 0; i < 4; i++) await shop.getByRole('button', { name: 'Pay with telebirr' }).click();
  await shop.getByRole('link', { name: 'Checkout →' }).click(); // page unload → beacon delivery
  await expect(shop.getByRole('heading', { name: 'Checkout' })).toBeVisible();

  // Back in Pulse: verification flips to live on its own.
  await expect(page.getByText('Live — receiving visits')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Live', { exact: true }).first()).toBeVisible();
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .exclude('[role="log"][aria-live]')
    .analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);

  await page.getByRole('link', { name: 'Today' }).first().click();
  await expect(page.getByText('Visits are coming in.', { exact: false })).toBeVisible();
  await expect(page.getByText('Visits (24 h)')).toBeVisible();
});

test('the collector serves the SDK and legacy script URLs', async ({ request }) => {
  for (const path of ['/sdk/p.js', '/sdk/3/p.js', '/dxm.js', '/dxm.v2.js', '/sdk/v.js']) {
    const res = await request.get(`${COLLECTOR_URL}${path}`);
    expect(res.status(), path).toBe(200);
    expect(res.headers()['content-type']).toContain('javascript');
  }
});
