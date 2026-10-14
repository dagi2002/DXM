import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * WCAG 2.2 AA sweep of the platform screens (Today, fixes, replays, reports, landing, site tabs,
 * install) in light and dark, at desktop and 360px (the two Playwright projects).
 */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function expectAccessible(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(TAGS)
    // React Aria's off-screen live announcer keeps stale announcements; never focusable or visible.
    .exclude('[role="log"][aria-live]')
    .analyze();
  const violations = results.violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.nodes.map((n) => `${n.target.join(' ')} — ${n.failureSummary}`).join(' | ')}`,
  );
  expect(violations, `axe violations on ${label}`).toEqual([]);
}

/**
 * Color transitions make axe read half-blended colors right after a scheme switch, so freeze
 * them and let two frames pass before scanning.
 */
async function settleColors(page: Page) {
  await page.addStyleTag({
    content: '*, *::before, *::after { transition: none !important; animation: none !important; }',
  });
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

async function scanBothSchemes(page: Page, label: string) {
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await settleColors(page);
    await expectAccessible(page, `${label} (${colorScheme})`);
  }
  await page.emulateMedia({ colorScheme: 'light' });
}

async function visit(page: Page, path: string, heading?: RegExp | string) {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1, ...(heading ? { name: heading } : {}) })).toBeVisible();
}

test('public screens: landing and shared report', async ({ page }) => {
  await visit(page, '/welcome');
  await scanBothSchemes(page, '/welcome');
  await visit(page, '/r/demo-september');
  await scanBothSchemes(page, '/r/demo-september');
});

test('signed-in screens: today, fix, site tabs, replay, reports', async ({ page }, info) => {
  test.setTimeout(120_000); // ~20 axe scans
  await page.goto('/sign-up');
  await page.getByRole('radio', { name: 'EN' }).check({ force: true });
  await page.getByLabel('Your name').fill('Tigist Haile');
  await page.getByLabel('Email').fill(`a11y-${info.project.name}-${Date.now()}@example.et`);
  await page.getByLabel('Password', { exact: true }).fill('e2e passphrase long enough');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByLabel('Organization name').fill('Abebe Furniture');
  await page.getByRole('button', { name: 'Create organization' }).click();
  await page.getByRole('button', { name: 'Add a site' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a site' });
  await dialog.getByLabel('Site name').fill('Abebe Furniture');
  await dialog.getByLabel('Domain').fill(`a11y-${info.project.name}.example.et`);
  await dialog.getByRole('button', { name: 'Add site' }).click();
  await expect(page).toHaveURL(/\/sites\/site_/);
  const sitePath = new URL(page.url()).pathname;

  // Site page: every tab, reached with the keyboard (arrow keys move focus and selection).
  const tabs = page.getByRole('tablist', { name: 'Site sections' });
  await expect(tabs.getByRole('tab', { selected: true })).toBeVisible();
  for (const name of ['Overview', 'Replays', 'Install']) {
    await tabs.getByRole('tab', { name }).click();
    await expect(tabs.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel', { name })).toBeVisible();
    await scanBothSchemes(page, `${sitePath} ${name}`);
  }
  await tabs.getByRole('tab', { name: 'Overview' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(tabs.getByRole('tab', { name: 'Replays' })).toBeFocused();
  await expect(tabs.getByRole('tab', { name: 'Replays' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('End');
  await expect(tabs.getByRole('tab', { name: 'Install' })).toBeFocused();

  // Today: status tabs are a real tablist with one tab stop.
  await visit(page, '/today');
  const status = page.getByRole('tablist', { name: 'Fix status' });
  await expect(status.locator('[tabindex="0"]')).toHaveCount(1);
  await status.getByRole('tab', { selected: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(status.getByRole('tab', { selected: true })).toBeFocused();
  await page.keyboard.press('Home');
  await scanBothSchemes(page, '/today');

  await visit(page, '/fixes/fix_128');
  await scanBothSchemes(page, '/fixes/fix_128');
  // Changing status keeps focus on the page instead of dropping it to <body>.
  const firstStatusButton = page.getByRole('button', { name: 'Mark as fixing' });
  if (await firstStatusButton.isVisible()) {
    await firstStatusButton.click();
    await expect(page.locator('body')).not.toBeFocused();
  }

  await visit(page, '/replays/rep_1406');
  await scanBothSchemes(page, '/replays/rep_1406');

  await visit(page, '/reports');
  await scanBothSchemes(page, '/reports');

  // Route changes move focus to the new page's heading.
  await page.getByRole('link', { name: 'Today' }).first().click();
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();

  // Amharic: the same screens with Ethiopic sizing.
  await page.goto('/today');
  await page.getByRole('radio', { name: 'አማ' }).first().check({ force: true });
  await expect(page.locator('html')).toHaveAttribute('lang', 'am');
  for (const path of ['/today', '/fixes/fix_128', '/replays/rep_1406', '/reports', sitePath]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectAccessible(page, `${path} (am)`);
    // docs/rebuild/02 §2.4: Ethiopic text never renders below 14px.
    const tooSmall = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('body *')]
        .filter(
          (el) =>
            el.matches(':lang(am)') &&
            !el.closest('[role="img"], [aria-hidden="true"], .sr-only') &&
            el.checkVisibility() &&
            [...el.childNodes].some(
              (n) => n.nodeType === Node.TEXT_NODE && /[\u1200-\u137F]/.test(n.textContent ?? ''),
            ),
        )
        .map((el) => ({
          text: el.textContent?.trim().slice(0, 30),
          size: parseFloat(getComputedStyle(el).fontSize),
        }))
        .filter((x) => x.size < 14),
    );
    expect(tooSmall, `Ethiopic text under 14px on ${path}`).toEqual([]);
  }
});
