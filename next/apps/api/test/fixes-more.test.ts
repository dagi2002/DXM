import { FixDetail, FixList } from '@pulse/contracts';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { adminQuery, createTestContext, resetDatabase, signUpWithOrg, type TestContext } from './helpers';

/** Slice 3 part 2 in the fixes API: every evidence shape, verification results, AI suggestions. */
const off = createTestContext();
const ai = createTestContext({ AI_ENABLED: '1', ANTHROPIC_API_KEY: 'sk-test' });
beforeEach(resetDatabase);
afterAll(async () => {
  await off.database.close();
  await ai.database.close();
});

const visitor = {
  windowHours: 24,
  leftOnPage: 2,
  devices: { desktop: 0, mobile: 7, tablet: 0 },
  topBrowser: null,
  sampleVisitIds: ['visit_1'],
};
const EVIDENCE: Record<string, object> = {
  form_abandon: {
    type: 'form',
    ...visitor,
    path: '/contact',
    form: 'lead',
    visits: 7,
    starts: 9,
    submits: 2,
    abandonRate: 0.778,
    errorFields: [{ field: 'phone', visits: 4, message: 'Invalid' }],
  },
  slow_page: {
    type: 'slow_page',
    ...visitor,
    path: '/products/*',
    metric: 'LCP',
    visits: 7,
    measured: 12,
    p75: 6100,
    threshold: 4000,
    networks: [{ network: '3g', visits: 8, p75: 7200 }],
  },
  js_error: {
    type: 'js_error',
    ...visitor,
    path: '/blog',
    visits: 7,
    message: 'x is not defined',
    source: '/app.js',
    line: 12,
    occurrences: 9,
    pages: [{ path: '/blog', visits: 7 }],
  },
  u_turn: {
    type: 'u_turn',
    ...visitor,
    path: '/delivery',
    visits: 7,
    uTurns: 8,
    reached: 20,
    rate: 0.35,
    medianSeconds: 3,
    from: [{ path: '/products', visits: 7 }],
  },
  tracking_broken: {
    type: 'tracking',
    lastEventAt: '2026-10-13T08:00:00.000Z',
    silentHours: 26,
    typicalDailyVisits: 80,
  },
  // Written before evidence had a `type`: still reads as click evidence.
  rage_click: {
    ...visitor,
    path: '/checkout',
    selector: 'button.pay',
    visits: 7,
    occurrences: 9,
    clicks: 40,
    maxBurst: 8,
  },
};

let n = 0;
async function seed(
  orgId: string,
  siteId: string,
  kind: string,
  extra: { status?: string; verification?: object } = {},
) {
  n += 1;
  const id = `iss_more${String(n).padStart(16, '0')}`;
  await adminQuery(
    `insert into issues (id, org_id, site_id, number, kind, fingerprint, severity, status, evidence, first_seen, last_seen, fixed_at, verification)
     values ($1, $2, $3, $4, $5, $1, 'watch', $6, $7, now(), now(), $8, $9)`,
    [
      id,
      orgId,
      siteId,
      n,
      kind,
      extra.status ?? 'open',
      JSON.stringify(EVIDENCE[kind]),
      extra.status === 'fixed' || extra.status === 'verified' ? new Date() : null,
      extra.verification ? JSON.stringify(extra.verification) : null,
    ],
  );
  return id;
}

async function orgWithSite(ctx: TestContext, email: string, domain: string) {
  const { client, orgId } = await signUpWithOrg(ctx.app, email);
  const site = await client.post('/api/v1/sites', { name: domain, domain });
  expect(site.status).toBe(201);
  return { client, orgId, siteId: site.body.site.id as string };
}

async function addSuggestion(orgId: string, issueId: string, text: string, at = new Date()) {
  await adminQuery(
    `insert into ai_artifacts (id, org_id, issue_id, kind, input_hash, model, content, created_at)
     values ($1, $2, $3, 'fix_suggestion', $1, 'test-model', $4, $5)`,
    [`ai_${text.length}_${at.getTime()}`, orgId, issueId, JSON.stringify({ text, code: null }), at],
  );
}

describe('fixes API, slice 3 part 2', () => {
  it('returns every evidence shape, and old click rows as click evidence', async () => {
    const { client, orgId, siteId } = await orgWithSite(off, 'owner@shop.et', 'shop.et');
    for (const kind of Object.keys(EVIDENCE)) await seed(orgId, siteId, kind);
    const res = await client.get('/api/v1/fixes');
    expect(res.status).toBe(200);
    const { fixes } = FixList.parse(res.body);
    const types = Object.fromEntries(fixes.map((f) => [f.kind, f.evidence.type]));
    expect(types).toEqual({
      form_abandon: 'form',
      slow_page: 'slow_page',
      js_error: 'js_error',
      u_turn: 'u_turn',
      tracking_broken: 'tracking',
      rage_click: 'click',
    });
    expect(fixes.every((f) => f.verification === null && f.suggestion === null)).toBe(true);
  });

  it('returns the verification result, and clears it when someone reopens the fix', async () => {
    const { client, orgId, siteId } = await orgWithSite(off, 'owner@shop.et', 'shop.et');
    const verification = {
      outcome: 'verified',
      measure: 'rate',
      before: { affected: 20, exposed: 40, value: 0.5 },
      after: { affected: 1, exposed: 50, value: 0.02 },
      checkedAt: '2026-10-14T05:00:00.000Z',
    };
    const id = await seed(orgId, siteId, 'rage_click', { status: 'verified', verification });
    const detail = FixDetail.parse((await client.get(`/api/v1/fixes/${id}`)).body);
    expect(detail.fix.verification).toEqual(verification);
    const reopened = await client.patch(`/api/v1/fixes/${id}`, { status: 'open' });
    expect(reopened.status).toBe(200);
    expect(reopened.body.fix.verification).toBeNull();
  });
});

describe('AI suggestions in the feed', () => {
  it('includes the newest suggestion with AI on, and none with AI off', async () => {
    const onSide = await orgWithSite(ai, 'owner@shop.et', 'shop.et');
    const id = await seed(onSide.orgId, onSide.siteId, 'js_error');
    await addSuggestion(onSide.orgId, id, 'Older idea', new Date('2026-10-10T00:00:00Z'));
    await addSuggestion(
      onSide.orgId,
      id,
      'Define x before the snippet runs.',
      new Date('2026-10-12T00:00:00Z'),
    );

    const list = FixList.parse((await onSide.client.get('/api/v1/fixes')).body);
    expect(list.fixes[0]!.suggestion).toMatchObject({
      text: 'Define x before the snippet runs.',
      code: null,
      model: 'test-model',
    });
    const detail = FixDetail.parse((await onSide.client.get(`/api/v1/fixes/${id}`)).body);
    expect(detail.fix.suggestion?.text).toBe('Define x before the snippet runs.');

    // The same org through a deployment with AI off: the box has nothing to show.
    const offClient = await signUpWithOrg(off.app, 'second@shop.et');
    const offSite = await offClient.client.post('/api/v1/sites', { name: 'b.et', domain: 'b.et' });
    const offId = await seed(offClient.orgId, offSite.body.site.id, 'js_error');
    await addSuggestion(offClient.orgId, offId, 'Hidden when AI is off');
    const offList = FixList.parse((await offClient.client.get('/api/v1/fixes')).body);
    expect(offList.fixes[0]!.suggestion).toBeNull();
  });

  it("never leaks another org's fix or suggestion", async () => {
    const a = await orgWithSite(ai, 'owner@a.et', 'a.et');
    const b = await orgWithSite(ai, 'owner@b.et', 'b.et');
    const id = await seed(a.orgId, a.siteId, 'u_turn');
    await addSuggestion(a.orgId, id, 'Secret to org A');
    expect((await b.client.get(`/api/v1/fixes/${id}`)).status).toBe(404);
    const list = FixList.parse((await b.client.get('/api/v1/fixes')).body);
    expect(list.fixes).toEqual([]);
  });
});
