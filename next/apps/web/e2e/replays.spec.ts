import { gunzipSync } from 'node:zlib';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { COLLECTOR_URL, DEMO_URL } from '../playwright.config';

/**
 * Slice 4: a visitor on the customer's site is recorded by the lazy r.js (real rrweb, real
 * Chromium), the chunks cross origins to the collector, land on disk, and play back in Pulse.
 * Masking is checked on the bytes that were actually stored, not just on screen.
 */
test('records a short visit on the customer site and plays it back, masked', async ({
  page,
  context,
}, info) => {
  test.setTimeout(90_000);
  await page.goto('/sign-up');
  await page.getByRole('radio', { name: 'EN' }).check({ force: true });
  await page.getByLabel('Your name').fill('Tigist Haile');
  await page.getByLabel('Email').fill(`replay-${info.project.name}-${Date.now()}@example.et`);
  await page.getByLabel('Password', { exact: true }).fill('e2e passphrase long enough');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByLabel('Organization name').fill('Abebe Furniture');
  await page.getByRole('button', { name: 'Create organization' }).click();
  await page.getByRole('button', { name: 'Add a site' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a site' });
  await dialog.getByLabel('Site name').fill('Demo shop');
  await dialog.getByLabel('Domain').fill(`replay-${info.project.name}-${Date.now()}.example.et`);
  await dialog.getByRole('button', { name: 'Add site' }).click();
  const snippet = (await page.getByLabel('Install tracking').textContent()) ?? '';
  const key = snippet.match(/data-site="([^"]+)"/)?.[1];
  expect(key).toMatch(/^pk_/);
  await page.getByLabel('Also accept data from').fill(DEMO_URL);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();

  // The visit: the recorder loads lazily once the page is idle and the collector samples it in.
  const shop = await context.newPage();
  await shop.goto(`${DEMO_URL}/?k=${key}&c=${encodeURIComponent(COLLECTOR_URL)}`);
  await expect
    .poll(
      () =>
        shop.evaluate(() =>
          Boolean((window as unknown as { dxm?: { _r?: { started?: boolean } } }).dxm?._r?.started),
        ),
      { timeout: 15_000 },
    )
    .toBe(true);
  await shop.getByLabel('Phone').fill('0911223344');
  await shop.getByRole('button', { name: 'Add to cart' }).click();
  for (let i = 0; i < 4; i++) await shop.getByRole('button', { name: 'Pay with telebirr' }).click();
  await shop.waitForTimeout(500);
  await shop.getByRole('link', { name: 'Checkout →' }).click(); // page hide → the chunk is sent
  await expect(shop.getByRole('heading', { name: 'Checkout' })).toBeVisible();

  // Collector → blob store → worker → API.
  let visitId = '';
  await expect
    .poll(
      async () => {
        const res = await page.request.get('/api/v1/replays');
        const body = (await res.json()) as { replays: { id: string }[] };
        visitId = body.replays[0]?.id ?? '';
        return body.replays.length;
      },
      { timeout: 30_000 },
    )
    .toBe(1);

  // What was stored: masked by default, the unmasked card readable, the typed phone number nowhere.
  const detail = (await (await page.request.get(`/api/v1/replays/${visitId}`)).json()) as {
    chunks: { url: string }[];
  };
  expect(detail.chunks.length).toBeGreaterThan(0);
  let stored = '';
  for (const c of detail.chunks) {
    const res = await page.request.get(c.url);
    expect(res.status()).toBe(200);
    stored += gunzipSync(await res.body()).toString('utf8');
  }
  expect(stored).toContain('Sofa'); // data-dxm-unmask
  for (const secret of ['0911223344', 'Tigist', 'Haile', 'Bole', 'Your details']) {
    expect(stored, `"${secret}" leaked into the recording`).not.toContain(secret);
  }
  expect(stored).not.toContain('k=pk_'); // page URL scrubbed

  // Playback in Pulse.
  await page.goto('/replays');
  const list = page.getByTestId('replay-list');
  await expect(list.getByRole('link')).toHaveCount(1);
  await list.getByRole('link').first().click({ timeout: 15_000 });
  await expect(page).toHaveURL(new RegExp(`/replays/${visitId}`));
  await expect(page.getByRole('heading', { level: 1, name: /^Visit on / })).toBeVisible();
  await expect(page.getByText('Loading the recording…')).toBeHidden({ timeout: 15_000 });
  await expect(page.getByText('This recording couldn’t be loaded', { exact: false })).toHaveCount(0);

  // The recording keeps its own viewport size but must never widen the page around it.
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
    .toBeLessThanOrEqual(0);

  // rrweb's iframe is sandboxed without scripts, so read it from the parent page (same origin)
  // instead of evaluating inside it.
  const replayed = () =>
    page.evaluate(() => {
      const doc = document.querySelector<HTMLIFrameElement>('.replayer-wrapper iframe')?.contentDocument;
      return doc?.body?.textContent ?? '';
    });
  await expect.poll(replayed, { timeout: 15_000 }).toContain('Sofa');
  expect(await replayed()).not.toContain('Tigist');

  console.log('DEBUG', JSON.stringify(await page.evaluate(() => {
    const sec = document.querySelector('section[aria-label]')!;
    const all = [...document.querySelectorAll('*')].filter((e) => e.scrollLeft || e.scrollTop).map((e) => `${e.tagName}.${e.className.toString().slice(0,40)} ${e.scrollLeft},${e.scrollTop}`);
    const play = [...document.querySelectorAll('button[aria-label="Play"]')].map((b) => JSON.stringify(b.getBoundingClientRect()));
    const sw = [...document.querySelectorAll('*')].filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== 'visible').map((e) => `${e.tagName}.${e.className.toString().slice(0,50)} sw=${e.scrollWidth} cw=${e.clientWidth} sh=${e.scrollHeight} ch=${e.clientHeight} ox=${getComputedStyle(e).overflowX}`);
    const pb = document.querySelector('button[aria-label="Play"]')!.getBoundingClientRect();
    const hit = document.elementFromPoint(pb.x + pb.width / 2, pb.y + pb.height / 2);
    const chain = []; for (let e = document.querySelector('button[aria-label="Play"]') as HTMLElement | null; e; e = e.parentElement) chain.push(`${e.tagName} ${Math.round(e.getBoundingClientRect().x)},${Math.round(e.getBoundingClientRect().y)} ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`);
    const aside = document.querySelector('aside')!.getBoundingClientRect();
    return { hit: hit ? `${hit.tagName}.${hit.className.toString().slice(0, 40)}` : null, chain, aside: JSON.stringify(aside), ua: navigator.userAgent, sw, all, play, w: window.innerWidth, active: document.activeElement?.tagName, sx: window.scrollX, sy: window.scrollY, sec: sec?.getAttribute('aria-label') };
  })));
  // Timeline marks from the visit's events, and the clock moves when playing.
  await expect(page.getByRole('button', { name: /Opened \// }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Play', exact: true }).click({ timeout: 15_000 });
  await expect(page.getByTestId('replay-clock')).not.toHaveText(/^0:00 \//, { timeout: 10_000 });
  await page.getByRole('button', { name: 'Pause', exact: true }).click({ timeout: 15_000 });

  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .exclude('[role="log"][aria-live]')
    .exclude('.replayer-wrapper') // the customer's own recorded page, not Pulse UI
    .options({ iframes: false })
    .analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual(
    [],
  );
});

test('the collector serves the replay recorder', async ({ request }) => {
  for (const path of ['/sdk/r.js', '/sdk/3/r.js']) {
    const res = await request.get(`${COLLECTOR_URL}${path}`);
    expect(res.status(), path).toBe(200);
    expect(res.headers()['content-type']).toContain('javascript');
  }
});
