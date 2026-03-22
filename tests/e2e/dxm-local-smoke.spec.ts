import { expect, test, type Page } from '@playwright/test';

const WEB_URL = process.env.DXM_WEB_URL || 'http://localhost:5173';
const API_URL = process.env.DXM_API_URL || 'http://localhost:4000';
const SDK_BASE = process.env.DXM_SDK_BASE || 'http://localhost:8080';
const ADMIN_SECRET = process.env.ADMIN_SECRET || '';

interface SiteSummary {
  id: string;
  domain: string;
}

interface SessionSummary {
  id: string;
  hasReplay: boolean;
  metadata: {
    url?: string;
  };
  stats: {
    totalEvents: number;
  };
}

interface SessionReplay {
  sessionId: string;
  events: unknown[];
}

interface HeatmapReadModel {
  sessions: Array<{ id: string }>;
  points: Array<{ sessionId: string }>;
}

async function getJson<T>(page: Page, url: string): Promise<T> {
  const response = await page.request.get(url);
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<T>;
}

test('DXM local smoke flow captures sessions, replay, and heatmaps', async ({ page, context }) => {
  const nonce = Date.now();
  const email = `smoke-e2e-${nonce}@dxmpulse.local`;
  const workspaceName = `Smoke Workspace ${nonce}`;
  const siteName = `Smoke Site ${nonce}`;
  const domain = `smoke-${nonce}.example`;

  await page.goto(`${WEB_URL}/signup`);

  await page.getByPlaceholder('Abebe Kebede').fill('Smoke Tester');
  await page.getByPlaceholder('abebe@yourcompany.com').fill(email);
  await page.getByPlaceholder('Addis Growth Studio').fill(workspaceName);
  await page.getByPlaceholder('Min. 8 characters').fill('smoke-test-password');
  await page.getByRole('button', { name: 'Create free account' }).click();

  await expect(page).toHaveURL(/\/onboarding/);
  await expect(page.getByRole('heading', { name: 'Your workspace is ready' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /Continue setup/i }).click();

  await page.getByPlaceholder('Abebe Furniture').fill(siteName);
  await page.getByPlaceholder('abebefurniture.et').fill(`https://${domain}/`);
  await page.getByRole('button', { name: /Generate install snippet/i }).click();

  const snippet = await page.locator('pre').textContent();
  const siteKey = snippet?.match(/data-site-id="([^"]+)"/)?.[1];
  expect(siteKey).toBeTruthy();

  const sites = await getJson<SiteSummary[]>(page, `${API_URL}/sites`);
  const createdSite = sites.find((site) => site.domain === domain);
  expect(createdSite?.id).toBeTruthy();

  // Upgrade workspace to 'starter' so replay (a paid feature) is available.
  const me = await getJson<{ workspace: { id: string } }>(page, `${API_URL}/auth/me`);
  const workspaceId = me.workspace.id;
  const upgradeResp = await page.request.patch(
    `${API_URL}/admin/workspaces/${workspaceId}/plan`,
    {
      headers: { 'x-admin-key': ADMIN_SECRET, 'content-type': 'application/json' },
      data: { plan: 'starter' },
    },
  );
  expect(upgradeResp.ok()).toBeTruthy();

  const smokeUrl = new URL('/test.html', WEB_URL);
  smokeUrl.searchParams.set('siteKey', siteKey!);
  smokeUrl.searchParams.set('apiUrl', API_URL);
  smokeUrl.searchParams.set('sdkBase', SDK_BASE);

  const smokePage = await context.newPage();
  await smokePage.goto(smokeUrl.toString());
  await expect(smokePage.locator('#status')).toContainText('DXM base SDK and replay extension loaded', {
    timeout: 30_000,
  });

  await smokePage.locator('#name-input').fill('Smoke Test User');
  await smokePage.locator('#email-input').fill(email);
  await smokePage.locator('#notes-input').fill('Playwright smoke test for DXM local tracking.');
  await smokePage.locator('#identify-btn').click();
  await smokePage.locator('#custom-btn').click();
  await smokePage.locator('#conversion-btn').click();
  await smokePage.locator('#navigate-btn').click();
  await smokePage.locator('#pricing-link').click();
  await smokePage.locator('#checkout-btn').click();
  await smokePage.locator('#secondary-cta-btn').click();
  await smokePage.locator('#pricing-cta-btn').click();
  await smokePage.locator('#book-demo-btn').click();
  await smokePage.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

  // Flush both SDKs while the page is still alive.
  // Nullify sendBeacon so both SDKs fall through to XHR fallback.
  // (The replay SDK has an unconditional return after sendBeacon — setting it
  // to () => false skips XHR. Setting it to undefined skips the entire block.)
  const collectFlush = smokePage.waitForResponse(
    (resp) => resp.url().endsWith('/collect') && resp.request().method() === 'POST',
    { timeout: 15_000 },
  );
  const replayFlush = smokePage.waitForResponse(
    (resp) => resp.url().includes('/collect-replay') && resp.request().method() === 'POST',
    { timeout: 15_000 },
  );
  await smokePage.evaluate(() => {
    (navigator as any).sendBeacon = undefined;
    window.dispatchEvent(new Event('pagehide'));
  });
  await Promise.all([collectFlush, replayFlush]);
  await smokePage.close();

  await expect.poll(async () => {
    const verification = await getJson<{ verified: boolean }>(
      page,
      `${API_URL}/sites/${createdSite!.id}/verify`,
    );
    return verification.verified;
  }, { timeout: 30_000, intervals: [1000, 2000, 3000] }).toBe(true);

  await expect(page.getByText('Tracking is live for this client site.')).toBeVisible({
    timeout: 30_000,
  });

  await expect.poll(async () => {
    const sessions = await getJson<SessionSummary[]>(page, `${API_URL}/sessions`);
    return sessions.some((session) =>
      (session.metadata.url || '').includes('/test.html') &&
      session.stats.totalEvents > 0 &&
      session.hasReplay
    );
  }, { timeout: 30_000, intervals: [1000, 2000, 3000] }).toBe(true);

  const sessions = await getJson<SessionSummary[]>(page, `${API_URL}/sessions`);
  const smokeSession = sessions.find((session) =>
    (session.metadata.url || '').includes('/test.html') &&
    session.hasReplay
  );

  expect(smokeSession?.id).toBeTruthy();

  // Validate replay data via direct API call (deterministic, no network interception)
  const replayData = await getJson<SessionReplay>(
    page,
    `${API_URL}/sessions/${smokeSession!.id}/replay`,
  );
  expect(replayData.sessionId).toBe(smokeSession!.id);
  expect(replayData.events.length).toBeGreaterThan(0);

  // Verify replay UI renders
  await page.goto(`${WEB_URL}/sessions`);
  await expect(page.getByRole('heading', { name: 'Session Replays' })).toBeVisible({ timeout: 15_000 });
  await page.locator('button').filter({ hasText: 'test.html' }).first().click({ timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Session Replay', exact: true })).toBeVisible({ timeout: 15_000 });

  // Validate heatmap data via direct API call
  const heatmapData = await getJson<HeatmapReadModel>(
    page,
    `${API_URL}/analytics/heatmap`,
  );
  expect(heatmapData.sessions.some((session) => session.id === smokeSession!.id)).toBe(true);
  expect(heatmapData.points.some((point) => point.sessionId === smokeSession!.id)).toBe(true);

  // Verify analytics UI renders
  await page.goto(`${WEB_URL}/analytics`);
  await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Heatmap Analysis' })).toBeVisible();
});
