import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';

/**
 * Task 13: delete a recording, the replay sample rate, the funnel editor (keyboard only) and
 * report branding (logo limits, the share link, A4 print). Desktop and 360px, axe in light and dark.
 */
const user = process.env.USER ?? 'postgres';
const E2E_ADMIN_DB = process.env.E2E_DATABASE_ADMIN_URL ?? `postgres://${user}@localhost:5432/pulse_e2e`;
/** Same folder the API reads blobs from (playwright.config REPLAY_DIR). */
const REPLAY_DIR = resolve('.e2e-replays');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function admin(text: string, values: unknown[] = []) {
  const c = new pg.Client({ connectionString: E2E_ADMIN_DB });
  await c.connect();
  try {
    return await c.query(text, values);
  } finally {
    await c.end();
  }
}

async function expectAccessible(page: Page, label: string) {
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await page.addStyleTag({
      content: '*, *::before, *::after { transition: none !important; animation: none !important; }',
    });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    // (options() replaces withTags(), so the tags go in runOnly.)
    const results = await new AxeBuilder({ page })
      .exclude('[role="log"][aria-live]')
      .exclude('.replayer-wrapper')
      .options({ iframes: false, runOnly: { type: 'tag', values: TAGS } })
      .analyze();
    expect(
      results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
      `${label} (${colorScheme})`,
    ).toEqual([]);
  }
  await page.emulateMedia({ colorScheme: 'light' });
}

async function noSideways(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
    .toBeLessThanOrEqual(0);
}

async function signUpWithSite(page: Page, name: string) {
  await page.goto('/sign-up');
  await page.getByRole('radio', { name: 'EN' }).check({ force: true });
  await page.getByLabel('Your name').fill('Tigist Haile');
  await page.getByLabel('Email').fill(`${name}-${Date.now()}@example.et`);
  await page.getByLabel('Password', { exact: true }).fill('e2e passphrase long enough');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByLabel('Organization name').fill('Abebe Furniture');
  await page.getByRole('button', { name: 'Create organization' }).click();
  await page.getByRole('button', { name: 'Add a site' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a site' });
  await dialog.getByLabel('Site name').fill('Abebe Furniture');
  await dialog.getByLabel('Domain').fill(`${name}-${Date.now()}.example.et`);
  await dialog.getByRole('button', { name: 'Add site' }).click();
  await expect(page).toHaveURL(/\/sites\/site_/);
  const siteId = new URL(page.url()).pathname.split('/').pop()!;
  const { rows } = await admin('select org_id from sites where id = $1', [siteId]);
  return { siteId, orgId: rows[0].org_id as string };
}

/** A recorded visit as collector + worker would leave it: visit, events, chunk row and blob. */
async function seedReplay(orgId: string, siteId: string, visitId: string) {
  const t0 = Date.now() - 10 * 60_000;
  await admin(
    `insert into visits (site_id, id, org_id, started_at, last_seen_at, entry_path, device, browser, os, network, pageviews)
     values ($1, $2, $3, $4, $5, '/', 'mobile', 'Chrome', 'Android', '4g', 2)`,
    [siteId, visitId, orgId, new Date(t0), new Date(t0 + 60_000)],
  );
  for (const [type, at, path] of [
    ['pv', 0, '/'],
    ['pv', 20_000, '/checkout'],
  ] as const) {
    await admin(
      `insert into events (org_id, site_id, visit_id, ts_server, ts_client, type, path, props)
       values ($1, $2, $3, now(), $4, $5, $6, '{}')`,
      [orgId, siteId, visitId, new Date(t0 + at), type, path],
    );
  }
  const events = [
    { type: 4, timestamp: t0, data: { href: 'https://shop.example.et/', width: 390, height: 844 } },
    {
      type: 2,
      timestamp: t0 + 10,
      data: {
        node: {
          type: 0,
          id: 1,
          childNodes: [
            {
              type: 2,
              id: 2,
              tagName: 'html',
              attributes: {},
              childNodes: [{ type: 2, id: 3, tagName: 'body', attributes: {}, childNodes: [] }],
            },
          ],
        },
        initialOffset: { top: 0, left: 0 },
      },
    },
    { type: 3, timestamp: t0 + 60_000, data: { source: 2, type: 2, id: 3, x: 1, y: 1 } },
  ];
  const key = `orgs/${orgId}/sites/${siteId}/visits/${visitId}/0.json.gz`;
  const file = resolve(REPLAY_DIR, key);
  mkdirSync(dirname(file), { recursive: true });
  const data = gzipSync(JSON.stringify(events));
  writeFileSync(file, data);
  await admin(
    `insert into replay_chunks (site_id, visit_id, seq, org_id, bytes, object_key, events, first_ts, last_ts, has_snapshot)
     values ($1, $2, 0, $3, $4, $5, 3, $6, $7, true)`,
    [siteId, visitId, orgId, data.length, key, new Date(t0), new Date(t0 + 60_000)],
  );
}

test('an owner deletes a recording after confirming, and it is gone', async ({ page }, info) => {
  test.setTimeout(90_000);
  const { siteId, orgId } = await signUpWithSite(page, `del-${info.project.name}`);
  const visitId = `visit_del_${info.project.name}_${Date.now().toString(36)}`.slice(0, 40);
  await seedReplay(orgId, siteId, visitId);

  await page.goto(`/replays/${visitId}`);
  await expect(page.getByRole('heading', { level: 1, name: /^Visit on / })).toBeVisible();
  // AI is off in e2e: no recap box, no button, no placeholder.
  await expect(page.getByText('Recap · AI')).toHaveCount(0);
  await noSideways(page);

  await page.getByRole('button', { name: 'Delete recording' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete this recording?' });
  await expect(dialog).toBeVisible();
  await expectAccessible(page, 'delete recording dialog');
  // Cancel keeps it.
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  expect((await page.request.get(`/api/v1/replays/${visitId}`)).status()).toBe(200);

  await page.getByRole('button', { name: 'Delete recording' }).click();
  await page
    .getByRole('dialog', { name: 'Delete this recording?' })
    .getByRole('button', { name: 'Delete for good' })
    .click();
  await expect(page).toHaveURL(/\/replays$/);
  expect((await page.request.get(`/api/v1/replays/${visitId}`)).status()).toBe(404);
  const { rows } = await admin('select count(*)::int as n from replay_chunks where visit_id = $1', [visitId]);
  expect(rows[0].n).toBe(0);
  const audit = await admin(
    `select count(*)::int as n from audit_log where action = 'replay.delete' and target_id = $1`,
    [visitId],
  );
  expect(audit.rows[0].n).toBe(1);
});

test('the replay sample rate is set per site and persists', async ({ page }, info) => {
  const { siteId } = await signUpWithSite(page, `rate-${info.project.name}`);
  await page.getByRole('tab', { name: 'Replays' }).click();
  const panel = page.getByRole('tabpanel', { name: 'Replays' });
  await expect(panel.getByRole('heading', { name: 'Recording' })).toBeVisible();
  await expect(panel.getByRole('status')).toHaveText('Recording 100% of visits.');

  // Keyboard: open the picker, move to 25% and choose it.
  const picker = panel.getByRole('button', { name: /Share of visits recorded/ });
  await picker.focus();
  await page.keyboard.press('Enter');
  const listbox = page.getByRole('listbox');
  await expect(listbox).toBeVisible();
  await expect(listbox.getByRole('option')).toHaveText([
    '100%',
    '50%',
    '25%',
    '10%',
    'Off — record no visits',
  ]);
  await expectAccessible(page, 'sample rate picker');
  await listbox.getByRole('option', { name: '25%' }).click();
  await expect(panel.getByRole('status')).toHaveText('Saved · Recording 25% of visits.');
  await noSideways(page);

  const { rows } = await admin('select replay_sample_rate from sites where id = $1', [siteId]);
  expect(rows[0].replay_sample_rate).toBe(0.25);
  await page.reload();
  await page.getByRole('tab', { name: 'Replays' }).click();
  await expect(page.getByRole('tabpanel', { name: 'Replays' }).getByRole('status')).toHaveText(
    'Recording 25% of visits.',
  );
  await expectAccessible(page, 'site replays tab with the recording setting');
});

test('the funnel editor builds and reorders steps by keyboard alone', async ({ page }, info) => {
  test.setTimeout(90_000);
  const { siteId } = await signUpWithSite(page, `funnel-${info.project.name}`);
  await page.getByRole('tab', { name: 'Overview' }).click();
  const overview = page.getByRole('tabpanel', { name: 'Overview' });

  // Open with the keyboard.
  const open = overview.getByRole('button', { name: 'Build your own' });
  await open.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Edit funnel steps' });
  await expect(dialog).toBeVisible();
  const steps = dialog.getByRole('list', { name: 'Funnel steps' });
  // Starts from the lead-form template: 3 steps.
  await expect(steps.getByLabel('Step name')).toHaveCount(3);
  await expectAccessible(page, 'funnel editor');

  // Name the funnel.
  await dialog.getByLabel('Funnel name').fill('Order on Telegram');

  // Reorder: move step 1 down twice with Enter; focus stays on the moved step's button.
  const down = steps.getByRole('button', { name: 'Move “Visited the site” down' });
  await down.focus();
  await page.keyboard.press('Enter');
  await expect(steps.getByRole('button', { name: 'Move “Visited the site” down' })).toBeFocused();
  await page.keyboard.press('Enter');
  // At the bottom "down" is disabled, so focus moves to "up" on the same step.
  await expect(steps.getByRole('button', { name: 'Move “Visited the site” up' })).toBeFocused();
  for (const [i, label] of ['Started the form', 'Sent the form', 'Visited the site'].entries()) {
    await expect(steps.getByLabel('Step name').nth(i)).toHaveValue(label);
  }
  await expect(dialog.getByRole('status')).toHaveText('“Visited the site” is now step 3 of 3.');

  // Remove it with Space, then add a new step by keyboard: page or event per step.
  await page.keyboard.press('Shift+Tab'); // nothing breaks when walking backwards
  await steps.getByRole('button', { name: 'Remove “Visited the site”' }).focus();
  await page.keyboard.press('Space');
  await expect(steps.getByLabel('Step name')).toHaveCount(2);
  const add = dialog.getByRole('button', { name: 'Add a step' });
  await add.focus();
  await page.keyboard.press('Enter');
  await expect(steps.getByLabel('Step name').nth(2)).toBeFocused();
  await page.keyboard.type('Paid');
  await page.keyboard.press('Tab'); // → "Opens a page" (radio group)
  await page.keyboard.press('ArrowRight'); // → "Sends an event"
  await expect(steps.getByRole('radio', { name: 'Sends an event' }).nth(2)).toBeChecked();
  await page.keyboard.press('Tab'); // → event name
  await expect(steps.getByLabel('Event name')).toBeFocused();
  await page.keyboard.type('purchase');

  // A step with no page or event is refused with a reason.
  await add.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.type('Reviewed');
  const save = dialog.getByRole('button', { name: 'Save funnel' });
  await save.focus();
  await page.keyboard.press('Enter');
  await expect(dialog.getByText('Add a page address or an event name.')).toBeVisible();
  await steps.getByRole('button', { name: 'Remove “Reviewed”' }).focus();
  await page.keyboard.press('Enter');

  await save.focus();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  const { rows } = await admin('select name, template, steps from site_funnels where site_id = $1', [siteId]);
  expect(rows[0]).toEqual({
    name: 'Order on Telegram',
    template: 'custom',
    steps: [
      { label: 'Started the form', match: [{ kind: 'form', stage: 'start' }] },
      { label: 'Sent the form', match: [{ kind: 'form', stage: 'submit' }] },
      { label: 'Paid', match: [{ kind: 'event', name: 'purchase' }] },
    ],
  });
  await noSideways(page);
});

/** A 2×1 PNG (valid, so the browser can draw it). */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR4nGNgYPj/n4GBgQEAAvIBAI5oOZUAAAAASUVORK5CYII=',
  'base64',
);

test('report branding: logo limits, on the report and its share link, and A4 print', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(120_000);
  await signUpWithSite(page, `brand-${info.project.name}`);
  await page.goto('/settings?tab=organization');
  const branding = page.getByRole('region', { name: 'Report branding' });
  await expect(branding).toBeVisible();
  await branding.getByLabel('Agency name on reports').fill('Abay Digital');
  await branding.getByRole('button', { name: 'Save' }).click();
  await expect(branding.getByText('Saved', { exact: true })).toBeVisible();

  const input = branding.locator('input[type="file"]');
  // Too big and wrong type are refused before upload (and by the API too).
  await input.setInputFiles({ name: 'big.png', mimeType: 'image/png', buffer: Buffer.alloc(300 * 1024) });
  await expect(branding.getByText('That file is too big. Logos can be up to 256 KB.')).toBeVisible();
  await input.setInputFiles({
    name: 'logo.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
  });
  await expect(
    branding.getByText('That file isn’t a PNG, JPEG or WebP image.', { exact: false }),
  ).toBeVisible();
  // A PNG that is really HTML is refused by the server.
  await input.setInputFiles({
    name: 'fake.png',
    mimeType: 'image/png',
    buffer: Buffer.from('<html>hi</html>'),
  });
  await expect(
    branding.getByText('That file isn’t a PNG, JPEG or WebP image.', { exact: false }),
  ).toBeVisible();

  await input.setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG });
  await expect(branding.getByText('Logo saved')).toBeVisible();
  const preview = branding.getByRole('img', { name: 'Your logo as it appears on reports' });
  await expect(preview).toBeVisible();
  await expect.poll(() => preview.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(2);
  await expectAccessible(page, 'settings organization with branding');
  await noSideways(page);

  // The report carries the brand.
  await page.goto('/reports');
  await page.getByRole('button', { name: 'Create report' }).first().click();
  await page
    .getByRole('dialog', { name: 'Create report' })
    .getByRole('button', { name: 'Create report' })
    .click();
  await expect(page).toHaveURL(/\/reports\/rpt_/);
  const logo = page.getByRole('img', { name: 'Abay Digital logo' });
  await expect(logo).toBeVisible();
  await expect(page.getByText('Prepared by Abay Digital')).toBeVisible();

  // The share link shows it to someone with no session; the logo comes from the token's route.
  await page.getByRole('button', { name: 'Create link' }).click();
  const shareUrl = ((await page.getByLabel('Share link', { exact: true }).textContent()) ?? '').trim();
  const token = shareUrl.split('/r/')[1]!;
  const guest = await browser.newContext({ viewport: page.viewportSize()! });
  const pub = await guest.newPage();
  await pub.goto(`/r/${token}`);
  const pubLogo = pub.getByRole('img', { name: 'Abay Digital logo' });
  await expect(pubLogo).toBeVisible();
  expect(await pubLogo.getAttribute('src')).toMatch(new RegExp(`^/api/v1/public/reports/${token}/logo\\?v=`));
  await expect.poll(() => pubLogo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(2);
  // Without a session the org's own logo route is closed.
  expect((await pub.request.get('/api/v1/branding/logo')).status()).toBe(401);
  await expectAccessible(pub, 'public report with branding');
  await noSideways(pub);

  // "Download PDF" is print: on A4 the report fits the page width and the chrome is hidden.
  await pub.emulateMedia({ media: 'print', colorScheme: 'dark' });
  await pub.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  expect(await pub.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe('light');
  await expect(pub.getByRole('button', { name: 'Download PDF' })).toBeHidden();
  const pdf = await pub.pdf({ format: 'A4', printBackground: true });
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  await pub.setViewportSize({ width: 794, height: 1123 }); // A4 at 96 dpi
  const fits = await pub.evaluate(() => {
    const sheet = document.querySelector('.report-sheet')!;
    return (
      sheet.scrollWidth <= sheet.clientWidth + 1 && document.documentElement.scrollWidth <= window.innerWidth
    );
  });
  expect(fits).toBe(true);
  // Printing ends (the PDF call above fired its own before/after pair): the visitor's theme is back.
  await pub.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  expect(await pub.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBeNull();
  await guest.close();
});
