import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

const PASSWORD = 'e2e passphrase long enough';

async function expectAccessible(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    // React Aria's off-screen live announcer keeps stale "pending" announcements that reference
    // buttons removed by navigation; they are never focusable or visible.
    .exclude('[role="log"][aria-live]')
    .analyze();
  const violations = results.violations.map(
    (v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  );
  expect(violations, `axe violations on ${label}`).toEqual([]);
}

const uniqueEmail = (info: TestInfo, tag: string) => `${tag}-${info.project.name}-${Date.now()}@example.et`;

async function signUp(page: Page, info: TestInfo, tag: string, opts: { amharic?: boolean } = {}) {
  await page.goto('/sign-up');
  await page.getByRole('radio', { name: opts.amharic ? 'አማ' : 'EN' }).check({ force: true });
  const email = uniqueEmail(info, tag);
  if (opts.amharic) {
    await page.getByLabel('ስምዎ').fill('ትዕግስት ኃይሌ');
    await page.getByLabel('ኢሜይል').fill(email);
    await page.getByLabel('የይለፍ ቃል', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'አካውንት ክፈት' }).click();
  } else {
    await page.getByLabel('Your name').fill('Tigist Haile');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();
  }
  await expect(page).toHaveURL(/\/onboarding$/);
  return email;
}

test('protects app routes and keeps the destination', async ({ page }) => {
  await page.goto('/sites');
  await expect(page).toHaveURL(/\/sign-in\?redirect=%2Fsites/);
  await expect(page.getByRole('heading', { name: 'Sign in to Pulse' })).toBeVisible();
  await expectAccessible(page, 'sign-in');
});

test('core loop in English: sign up → organization → site lifecycle', async ({ page }, info) => {
  await signUp(page, info, 'en');
  await expectAccessible(page, 'onboarding');

  await page.getByLabel('Organization name').fill('Abebe Furniture');
  await page.getByRole('button', { name: 'Create organization' }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  await expect(page.getByText('No issues to fix yet')).toBeVisible();
  await expectAccessible(page, 'today');

  // Add a site from the empty state.
  await page.getByRole('button', { name: 'Add a site' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a site' });
  await expect(dialog).toBeVisible();
  await expectAccessible(page, 'add-site dialog');
  await dialog.getByLabel('Site name').fill('Abebe Furniture store');
  await dialog.getByLabel('Domain').fill('https://www.AbebeFurniture.et/shop?ref=1');
  await dialog.getByRole('button', { name: 'Add site' }).click();

  await expect(page).toHaveURL(/\/sites\/site_/);
  await expect(page.getByRole('heading', { level: 1, name: 'Abebe Furniture store' })).toBeVisible();
  await expect(page.getByText('www.abebefurniture.et')).toBeVisible();
  await expect(page.getByText('Not installed').first()).toBeVisible();
  await expectAccessible(page, 'site detail');

  // Edit.
  await page.getByRole('button', { name: 'Edit' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit site' });
  await edit.getByLabel('Site name').fill('Abebe Furniture');
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Abebe Furniture' })).toBeVisible();

  // Free plan allows one site: the limit is explained, not a silent failure.
  await page.getByRole('link', { name: 'Sites' }).first().click();
  await expect(page.getByRole('link', { name: /Abebe Furniture/ })).toBeVisible();
  await expectAccessible(page, 'sites list');
  await page.getByRole('button', { name: 'Add site' }).click();
  const second = page.getByRole('dialog', { name: 'Add a site' });
  await second.getByLabel('Site name').fill('Second');
  await second.getByLabel('Domain').fill('second.et');
  await second.getByRole('button', { name: 'Add site' }).click();
  await expect(second.getByRole('alert')).toContainText('Your plan allows 1 site');
  await page.keyboard.press('Escape');

  // Delete requires typing the domain.
  await page.getByRole('link', { name: /Abebe Furniture/ }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  const del = page.getByRole('dialog', { name: 'Delete Abebe Furniture?' });
  const confirm = del.getByRole('button', { name: 'Delete site' });
  await expect(confirm).toBeDisabled();
  await del.getByLabel('Type www.abebefurniture.et to confirm').fill('www.abebefurniture.et');
  await confirm.click();
  await expect(page).toHaveURL(/\/sites$/);
  await expect(page.getByText('No sites yet')).toBeVisible();
});

test('Amharic: language, html lang and Ethiopian calendar follow the user', async ({ page }, info) => {
  await signUp(page, info, 'am', { amharic: true });
  await expect(page.locator('html')).toHaveAttribute('lang', 'am');
  await expect(page.getByRole('heading', { name: 'ድርጅትዎን ይሰይሙ' })).toBeVisible();
  await page.getByLabel('የድርጅቱ ስም').fill('አበበ ፈርኒቸር');
  await page.getByRole('button', { name: 'ድርጅቱን ፍጠር' }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole('heading', { level: 1, name: 'ዛሬ' })).toBeVisible();
  // Amharic sign-ups default to the Ethiopian calendar.
  await expect(page.getByText(/ዓ\.ም/)).toBeVisible();
  await expectAccessible(page, 'today (am)');
});

test('settings: profile preferences persist and sign-out ends the session', async ({ page }, info) => {
  await signUp(page, info, 'settings');
  await page.getByLabel('Organization name').fill('Settings Org');
  await page.getByRole('button', { name: 'Create organization' }).click();
  await page.getByRole('link', { name: 'Settings' }).first().click();
  await expect(page.getByRole('tab', { name: 'Profile' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('radio', { name: 'Ethiopian' }).check({ force: true });
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved')).toBeVisible();
  await page.getByRole('tab', { name: 'Team' }).click();
  await expect(page.getByRole('list', { name: 'Team' })).toContainText('Tigist Haile');
  await expectAccessible(page, 'settings team');
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Team' })).toHaveAttribute('aria-selected', 'true');

  await page.getByRole('button', { name: 'Sign out' }).first().click();
  await expect(page).toHaveURL(/\/sign-in/);
  await page.goto('/today');
  await expect(page).toHaveURL(/\/sign-in/);
});
