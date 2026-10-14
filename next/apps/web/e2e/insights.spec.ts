import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';

/**
 * Site insights (slice 5): the Overview and Today's "this week" panel read the daily rollups the
 * worker fills. The rollups are seeded here the way the worker writes them, so the test doesn't
 * wait for the 10-minute sweep.
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

const DAY = 86_400_000;
const utcDay = (offset: number) => new Date(Date.now() - offset * DAY).toISOString().slice(0, 10);

async function seedRollups(siteId: string) {
  const { rows } = await admin('select org_id from sites where id = $1', [siteId]);
  const orgId = rows[0].org_id as string;
  for (let i = 0; i < 14; i++) {
    const visits = i < 7 ? 60 : 40; // this week vs last week
    await admin(
      `insert into rollup_site_day (site_id, org_id, day, visits, pageviews, closed_visits, bounced_visits,
         friction_visits, error_visits, rage_clicks, dead_clicks, errors)
       values ($1, $2, $3, $4, $4 * 2, $4, $4 / 4, $5, 1, $5, 0, 1)`,
      [siteId, orgId, utcDay(i), visits, i === 0 ? 12 : 2],
    );
  }
  await admin(
    `insert into rollup_page_day (site_id, org_id, day, path, visits, pageviews, entries, bounces, friction_visits, error_visits)
     values ($1, $2, $3, '/checkout', 90, 120, 10, 1, 25, 2), ($1, $2, $3, '/', 300, 320, 200, 50, 1, 0)`,
    [siteId, orgId, utcDay(0)],
  );
  await admin(
    `insert into rollup_vitals_day (site_id, org_id, day, metric, device, network, path, values)
     values ($1, $2, $3, 'LCP', 'mobile', '3g', '/checkout', '{5000,5200,5400,5600,5800}'),
            ($1, $2, $3, 'LCP', 'mobile', '4g', '/', '{1800,1900,2000,2100,2200}'),
            ($1, $2, $3, 'INP', 'mobile', '4g', '/', '{90,100,110,120,130}')`,
    [siteId, orgId, utcDay(0)],
  );
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
  await dialog.getByLabel('Domain').fill(`${name}.example.et`);
  await dialog.getByRole('button', { name: 'Add site' }).click();
  await expect(page).toHaveURL(/\/sites\/site_/);
  return new URL(page.url()).pathname.split('/').pop()!;
}

async function expectAccessible(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .exclude('[role="log"][aria-live]')
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
    label,
  ).toEqual([]);
}

test('a new site says it needs more visits instead of inventing numbers', async ({ page }, info) => {
  await signUpWithSite(page, `quiet-${info.project.name}`);
  await page.getByRole('tab', { name: 'Overview' }).click();
  const overview = page.getByRole('tabpanel', { name: 'Overview' });
  await expect(overview.getByRole('heading', { name: /Collecting visits/ })).toBeVisible();
  await expect(overview.getByText('Not enough visits yet', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Sample data')).toHaveCount(0);
});

test('overview and Today read real rollups; an owner sets up a telebirr funnel', async ({ page }, info) => {
  test.setTimeout(90_000);
  const siteId = await signUpWithSite(page, `insights-${info.project.name}`);
  await seedRollups(siteId);
  await page.reload();
  await page.getByRole('tab', { name: 'Overview' }).click();
  const overview = page.getByRole('tabpanel', { name: 'Overview' });

  await expect(overview.getByText('/checkout needs the most attention.')).toBeVisible();
  await expect(overview.getByLabel(/Health \d+ of 100/)).toBeVisible();
  await expect(overview.getByText('420', { exact: true })).toBeVisible(); // visits, last 7 days
  await expect(overview.getByText('3G')).toBeVisible();
  await expect(overview.getByText('25 stuck · 2 with errors')).toBeVisible();
  await expect(page.getByText('Sample data')).toHaveCount(0);
  await expectAccessible(page, 'site overview with data');

  // Today's "this week" panel: real visits, week over week.
  await page.getByRole('link', { name: 'Today' }).first().click();
  const week = page.getByRole('region', { name: 'This week vs last' });
  await expect(week.getByText('420', { exact: true })).toBeVisible();
  await expect(week.getByText('↑ 50%')).toBeVisible();
  await page.goBack();
  await page.getByRole('tab', { name: 'Overview' }).click();

  // 30-day range.
  await overview.getByRole('radio', { name: '30 days' }).check({ force: true });
  await expect(overview.getByText('Visits · last 30 days')).toBeVisible();
  await expect(overview.getByText('700', { exact: true })).toBeVisible();

  // Funnel from the Ethiopian template; counts come with the next rollup.
  await overview.getByRole('button', { name: 'Set up funnel' }).click();
  await expect(overview.getByRole('heading', { name: 'telebirr checkout' })).toBeVisible();
  await expect(overview.getByText('Counting visits for the new steps', { exact: false })).toBeVisible();
  await expect(overview.getByText('Chose telebirr')).toBeVisible();
  await expectAccessible(page, 'site overview with a funnel');
});
