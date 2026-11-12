import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import pg from 'pg';

/**
 * Notifications (task 15): the installable PWA, a service worker that caches the app shell only,
 * push settings that never prompt on their own (and say "not configured" here: e2e has no VAPID
 * keys), the Monday email switch, shared quiet hours, and the one-click unsubscribe page.
 */
const user = process.env.USER ?? 'postgres';
const E2E_ADMIN_DB = process.env.E2E_DATABASE_ADMIN_URL ?? `postgres://${user}@localhost:5432/pulse_e2e`;

async function admin(text: string, values: unknown[] = []) {
  const c = new pg.Client({ connectionString: E2E_ADMIN_DB });
  await c.connect();
  try {
    return await c.query(text, values);
  } finally {
    await c.end();
  }
}

async function signUp(page: Page, info: TestInfo, tag: string) {
  const email = `${tag}-${info.project.name}-${Date.now()}@example.et`;
  await page.goto('/sign-up');
  await page.getByRole('radio', { name: 'EN' }).check({ force: true });
  await page.getByLabel('Your name').fill('Tigist Haile');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('e2e passphrase long enough');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByLabel('Organization name').fill('Abebe Furniture');
  await page.getByRole('button', { name: 'Create organization' }).click();
  await expect(page).toHaveURL(/\/today$/);
  return email;
}

test('the app is installable: manifest with PNG and maskable icons', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = await (await request.get(href!)).json();
  expect(manifest).toMatchObject({ name: 'DXM Pulse', start_url: '/today', display: 'standalone' });
  const sizes = manifest.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes} ${i.purpose}`);
  expect(sizes).toEqual(expect.arrayContaining(['192x192 any', '512x512 any', '512x512 maskable']));
  for (const icon of manifest.icons) {
    const res = await request.get(icon.src);
    expect(res.status(), icon.src).toBe(200);
  }
});

test('the service worker caches the app shell and never an API response', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'one browser is enough for the cache contents');
  await signUp(page, info, 'sw');
  // The dev server doesn't auto-register it (production builds do, from boot.js): register it here.
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  // Use the app with the worker in control: these pages call the API.
  for (const path of ['/today', '/settings?tab=notifications', '/sites']) {
    await page.goto(path);
    await expect(page.locator('main')).toBeVisible();
  }
  const cached = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      for (const req of await (await caches.open(name)).keys()) urls.push(new URL(req.url).pathname);
    }
    return urls;
  });
  expect(cached).toContain('/');
  expect(cached.filter((p) => p.startsWith('/api/'))).toEqual([]);
  expect(cached.filter((p) => !/^\/($|boot\.js$|icon|manifest|assets\/)/.test(p))).toEqual([]);
  // API calls still go to the network under the worker.
  const me = await page.evaluate(async () => (await fetch('/api/v1/me')).status);
  expect(me).toBe(200);
});

test('Settings → Notifications: push never prompts on its own, digest and quiet hours save', async ({
  page,
}, info) => {
  // Count permission requests from the moment the page starts.
  await page.addInitScript(() => {
    const w = window as unknown as { __permissionRequests: number };
    w.__permissionRequests = 0;
    if ('Notification' in window) {
      const original = Notification.requestPermission.bind(Notification);
      Notification.requestPermission = (...args) => {
        w.__permissionRequests++;
        return original(...args);
      };
    }
  });
  await signUp(page, info, 'notify');
  await page.goto('/settings?tab=notifications');

  const pushPanel = page.getByRole('region', { name: 'Push notifications' });
  await expect(pushPanel.getByText('aren’t set up on this server (not configured)')).toBeVisible();
  await expect(pushPanel.getByRole('button')).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as unknown as { __permissionRequests: number }).__permissionRequests),
  ).toBe(0);

  const digest = page.getByRole('checkbox', { name: 'Send me the Monday email for this organization' });
  await expect(digest).toBeChecked();
  await digest.uncheck({ force: true });
  await expect(digest).not.toBeChecked();
  await page.reload();
  await expect(
    page.getByRole('checkbox', { name: 'Send me the Monday email for this organization' }),
  ).not.toBeChecked();

  const quiet = page.getByRole('region', { name: 'Quiet hours' });
  await quiet.getByRole('button', { name: /From/ }).click();
  await page.getByRole('option', { name: '22:00' }).click();
  await quiet.getByRole('button', { name: 'Save' }).click();
  await expect(quiet.getByText('Saved.')).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('region', { name: 'Quiet hours' }).getByRole('button', { name: /From/ }),
  ).toContainText('22:00');

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});

test('the Monday email’s unsubscribe link asks first, then switches it off', async ({ page }, info) => {
  const email = await signUp(page, info, 'unsub');
  // The digest job creates the member's preferences; here, saving the setting does.
  await page.goto('/settings?tab=notifications');
  await expect(page.getByRole('checkbox', { name: /Monday email/ })).toBeChecked();
  await page.getByRole('checkbox', { name: /Monday email/ }).uncheck({ force: true });
  await page.getByRole('checkbox', { name: /Monday email/ }).check({ force: true });
  await expect(page.getByRole('checkbox', { name: /Monday email/ })).toBeChecked();
  const { rows } = await admin(
    `select p.unsubscribe_token from notification_prefs p join "user" u on u.id = p.user_id where u.email = $1`,
    [email],
  );
  const token = rows[0].unsubscribe_token as string;

  // Signed out, like someone opening the link from their inbox.
  await page.context().clearCookies();
  await page.goto(`/unsubscribe.html#${token}`);
  await expect(page.getByRole('heading', { name: 'Stop the Monday email?' })).toBeVisible();
  // Opening the page changed nothing.
  expect(
    (await admin(`select weekly_digest from notification_prefs where unsubscribe_token = $1`, [token]))
      .rows[0].weekly_digest,
  ).toBe(true);
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(axe.violations).toEqual([]);
  await page.getByRole('button', { name: 'Stop the Monday email' }).click();
  await expect(page.getByRole('status')).toHaveText('Done. You won’t get the Monday email anymore.');
  expect(
    (await admin(`select weekly_digest from notification_prefs where unsubscribe_token = $1`, [token]))
      .rows[0].weekly_digest,
  ).toBe(false);

  // A fresh load (a hash change alone wouldn't reload the page).
  await page.goto('about:blank');
  await page.goto(`/unsubscribe.html#${'x'.repeat(32)}`);
  await page.getByRole('button', { name: 'Stop the Monday email' }).click();
  await expect(page.getByRole('status')).toContainText('isn’t valid anymore');
});
