import { expect, test, type Page } from '@playwright/test';

const WEB_URL = process.env.DXM_WEB_URL || 'http://localhost:5173';
const API_URL = process.env.DXM_API_URL || 'http://localhost:4000';
const SDK_BASE = process.env.DXM_SDK_BASE || 'http://localhost:8080';

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

  await expect(page.getByRole('heading', { name: 'Your workspace is ready' })).toBeVisible();
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
  await smokePage.waitForTimeout(1500);
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

  const replayResponsePromise = page.waitForResponse((response) =>
    response.url() === `${API_URL}/sessions/${smokeSession!.id}/replay` &&
    response.request().method() === 'GET'
  );

  await page.goto(`${WEB_URL}/sessions`);
  await expect(page.getByRole('heading', { name: 'Session Replays' })).toBeVisible();
  await page.locator('button').filter({ hasText: 'test.html' }).first().click();

  const replayResponse = await replayResponsePromise;
  expect(replayResponse.ok()).toBeTruthy();
  const replayData = await replayResponse.json() as SessionReplay;
  expect(replayData.sessionId).toBe(smokeSession!.id);
  expect(replayData.events.length).toBeGreaterThan(0);
  await expect(page.getByRole('heading', { name: 'Session Replay', exact: true })).toBeVisible();

  const heatmapResponsePromise = page.waitForResponse((response) =>
    response.url() === `${API_URL}/analytics/heatmap` &&
    response.request().method() === 'GET'
  );

  await page.goto(`${WEB_URL}/analytics`);
  await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Heatmap Analysis' })).toBeVisible();

  const heatmapResponse = await heatmapResponsePromise;
  expect(heatmapResponse.ok()).toBeTruthy();
  const heatmapData = await heatmapResponse.json() as HeatmapReadModel;
  expect(heatmapData.sessions.some((session) => session.id === smokeSession!.id)).toBe(true);
  expect(heatmapData.points.some((point) => point.sessionId === smokeSession!.id)).toBe(true);
});
