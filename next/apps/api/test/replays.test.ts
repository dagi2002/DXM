import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { FixList, ReplayDetail, ReplayList } from '@pulse/contracts';
import { LocalDiskBlobStore, replayObjectKey } from '@pulse/storage';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Client, adminQuery, createTestContext, resetDatabase, signUp, signUpWithOrg } from './helpers';

const REPLAY_DIR = mkdtempSync(join(tmpdir(), 'api-replays-'));
const ctx = createTestContext({ REPLAY_DIR });
const store = new LocalDiskBlobStore(REPLAY_DIR);
afterAll(() => ctx.database.close());

beforeEach(async () => {
  await resetDatabase();
  await adminQuery('delete from events');
});

async function orgWithSite(email: string, domain: string) {
  const { client, orgId } = await signUpWithOrg(ctx.app, email);
  const res = await client.post('/api/v1/sites', { name: domain, domain });
  expect(res.status).toBe(201);
  return { client, orgId, siteId: res.body.site.id as string };
}

async function inviteAndJoin(owner: Client, email: string, role: string) {
  const inv = await owner.post('/api/auth/organization/invite-member', { email, role });
  expect(inv.status).toBe(200);
  const id = ctx.mailer.lastTo(email)!.text.match(/accept-invitation\/(\S+)/)![1]!;
  const invitee = await signUp(ctx.app, email);
  expect((await invitee.post('/api/auth/organization/accept-invitation', { invitationId: id })).status).toBe(
    200,
  );
  return invitee;
}

const T0 = Date.now() - 10 * 60_000;
const rrweb = (start: number) => [
  { type: 4, timestamp: start, data: { href: 'https://shop.et/', width: 390, height: 844 } },
  {
    type: 2,
    timestamp: start + 10,
    data: { node: { type: 0, childNodes: [] }, initialOffset: { top: 0, left: 0 } },
  },
  { type: 3, timestamp: start + 90_000, data: { source: 2, type: 2, id: 1, x: 1, y: 1 } },
];

/** Seeds a recorded visit the way collector + worker would have: visit row, events, chunks, blobs. */
async function seedReplay(
  orgId: string,
  siteId: string,
  visitId: string,
  opts: { friction?: boolean; snapshot?: boolean; path?: string } = {},
) {
  await adminQuery(
    `insert into visits (site_id, id, org_id, started_at, last_seen_at, entry_path, device, browser, os, network, pageviews)
     values ($1, $2, $3, $4, $5, $6, 'mobile', 'Chrome', 'Android', '4g', 2)`,
    [siteId, visitId, orgId, new Date(T0), new Date(T0 + 90_000), opts.path ?? '/'],
  );
  const ev = (type: string, at: number, path: string, props: Record<string, unknown> = {}) =>
    adminQuery(
      `insert into events (org_id, site_id, visit_id, ts_server, ts_client, type, path, props)
       values ($1, $2, $3, now(), $4, $5, $6, $7)`,
      [orgId, siteId, visitId, new Date(T0 + at), type, path, JSON.stringify(props)],
    );
  await ev('pv', 0, opts.path ?? '/');
  await ev('pv', 30_000, '/checkout');
  if (opts.friction) await ev('rc', 60_000, '/checkout', { s: 'button.pay', n: 6 });
  for (const seq of [0, 1]) {
    const data = gzipSync(JSON.stringify(seq === 0 ? rrweb(T0).slice(0, 2) : rrweb(T0).slice(2)));
    const key = replayObjectKey({ orgId, siteId, visitId, seq });
    await store.put(key, new Uint8Array(data));
    await adminQuery(
      `insert into replay_chunks (site_id, visit_id, seq, org_id, bytes, object_key, events, first_ts, last_ts, has_snapshot)
       values ($1, $2, $3, $4, $5, $6, 2, $7, $8, $9)`,
      [
        siteId,
        visitId,
        seq,
        orgId,
        data.length,
        key,
        new Date(seq === 0 ? T0 : T0 + 90_000),
        new Date(seq === 0 ? T0 + 10 : T0 + 90_000),
        seq === 0 && opts.snapshot !== false,
      ],
    );
  }
}

let issueN = 0;
async function seedIssue(orgId: string, siteId: string, visitIds: string[]) {
  issueN++;
  const id = `iss_replay${String(issueN).padStart(14, '0')}`;
  await adminQuery(
    `insert into issues (id, org_id, site_id, number, kind, fingerprint, severity, status, evidence, first_seen, last_seen)
     values ($1, $2, $3, $4, 'rage_click', $5, 'critical', 'open', $6, now(), now())`,
    [
      id,
      orgId,
      siteId,
      issueN,
      `fp_r${issueN}`,
      JSON.stringify({
        path: '/checkout',
        selector: 'button.pay',
        windowHours: 24,
        visits: visitIds.length,
        occurrences: visitIds.length,
        leftOnPage: 1,
        devices: { desktop: 0, mobile: visitIds.length, tablet: 0 },
        topBrowser: null,
        sampleVisitIds: visitIds,
      }),
    ],
  );
  return id;
}

describe('GET /api/v1/replays', () => {
  it('lists playable replays with visit facts, friction and the fixes citing them', async () => {
    const a = await orgWithSite('owner@a.et', 'shop-a.et');
    await seedReplay(a.orgId, a.siteId, 'visit_friction1', { friction: true });
    await seedReplay(a.orgId, a.siteId, 'visit_calm_0001');
    await seedReplay(a.orgId, a.siteId, 'visit_nosnap_01', { snapshot: false });
    const fixId = await seedIssue(a.orgId, a.siteId, ['visit_friction1', 'visit_never_rec']);

    const res = await a.client.get('/api/v1/replays');
    expect(res.status).toBe(200);
    const { replays } = ReplayList.parse(res.body);
    expect(replays.map((r) => r.id).sort()).toEqual(['visit_calm_0001', 'visit_friction1']);
    const r = replays.find((x) => x.id === 'visit_friction1')!;
    expect(r).toMatchObject({
      siteId: a.siteId,
      siteDomain: 'shop-a.et',
      durationMs: 90_000,
      pageviews: 2,
      device: 'mobile',
      browser: 'Chrome',
      os: 'Android',
      network: '4g',
      frictionCount: 1,
      fixIds: [fixId],
    });

    const only = async (q: string) =>
      ReplayList.parse((await a.client.get(`/api/v1/replays?${q}`)).body).replays.map((x) => x.id);
    expect(await only('friction=1')).toEqual(['visit_friction1']);
    expect(await only(`fixId=${fixId}`)).toEqual(['visit_friction1']);
    expect((await only('page=/checkout')).sort()).toEqual(['visit_calm_0001', 'visit_friction1']);
    expect(await only('page=/nowhere')).toEqual([]);
    expect(await only(`siteId=${a.siteId}&limit=1`)).toHaveLength(1);
    expect(await only('siteId=site_other')).toEqual([]);
  });

  it('never shows another organization’s replays', async () => {
    const a = await orgWithSite('owner@a.et', 'shop-a.et');
    const b = await orgWithSite('owner@b.et', 'shop-b.et');
    await seedReplay(b.orgId, b.siteId, 'visit_of_org_b1', { friction: true });
    const fixB = await seedIssue(b.orgId, b.siteId, ['visit_of_org_b1']);
    expect(ReplayList.parse((await a.client.get('/api/v1/replays')).body).replays).toEqual([]);
    expect(ReplayList.parse((await a.client.get(`/api/v1/replays?siteId=${b.siteId}`)).body).replays).toEqual(
      [],
    );
    expect(ReplayList.parse((await a.client.get(`/api/v1/replays?fixId=${fixB}`)).body).replays).toEqual([]);
    expect((await a.client.get('/api/v1/replays/visit_of_org_b1')).status).toBe(404);
    expect((await a.client.get(`/api/v1/replays/visit_of_org_b1?siteId=${b.siteId}`)).status).toBe(404);
    expect((await a.client.raw(`/api/v1/replays/visit_of_org_b1/chunks/0?siteId=${b.siteId}`)).status).toBe(
      404,
    );
    expect((await a.client.delete('/api/v1/replays/visit_of_org_b1')).status).toBe(404);
    // B's recording is untouched.
    expect(
      await store.get(
        replayObjectKey({ orgId: b.orgId, siteId: b.siteId, visitId: 'visit_of_org_b1', seq: 0 }),
      ),
    ).not.toBeNull();
    expect((await b.client.get('/api/v1/replays/visit_of_org_b1')).status).toBe(200);
  });

  it('requires a session, and is team-only (client viewers get 403)', async () => {
    expect((await new Client(ctx.app).get('/api/v1/replays')).status).toBe(401);
    const a = await orgWithSite('owner@a.et', 'shop-a.et');
    await seedReplay(a.orgId, a.siteId, 'visit_friction1');
    const member = await inviteAndJoin(a.client, 'dev@a.et', 'member');
    const viewer = await inviteAndJoin(a.client, 'client@a.et', 'client_viewer');
    expect(ReplayList.parse((await member.get('/api/v1/replays')).body).replays).toHaveLength(1);
    expect((await viewer.get('/api/v1/replays')).status).toBe(403);
    expect((await viewer.get('/api/v1/replays/visit_friction1')).status).toBe(403);
    expect((await viewer.raw('/api/v1/replays/visit_friction1/chunks/0')).status).toBe(403);
  });
});

describe('GET /api/v1/replays/:visitId', () => {
  it('returns the timeline marks and chunk URLs that stream the stored blobs', async () => {
    const a = await orgWithSite('owner@a.et', 'shop-a.et');
    await seedReplay(a.orgId, a.siteId, 'visit_friction1', { friction: true });
    const res = await a.client.get('/api/v1/replays/visit_friction1');
    expect(res.status).toBe(200);
    const d = ReplayDetail.parse(res.body);
    expect(d.startTs).toBe(T0);
    expect(d.endTs).toBe(T0 + 90_000);
    expect(d.marks).toEqual([
      { at: 0, type: 'pv', path: '/', detail: null, friction: false },
      { at: 30_000, type: 'pv', path: '/checkout', detail: null, friction: false },
      { at: 60_000, type: 'rc', path: '/checkout', detail: 'button.pay', friction: true },
    ]);
    expect(d.chunks.map((c) => c.seq)).toEqual([0, 1]);
    expect(d.chunks[0]!.url).toBe(`/api/v1/replays/visit_friction1/chunks/0?siteId=${a.siteId}`);

    const chunk = await a.client.raw(d.chunks[0]!.url);
    expect(chunk.status).toBe(200);
    expect(chunk.headers.get('content-type')).toBe('application/gzip');
    expect(chunk.headers.get('cache-control')).toContain('private');
    const events = JSON.parse(gunzipSync(Buffer.from(await chunk.arrayBuffer())).toString());
    expect(events.map((e: { type: number }) => e.type)).toEqual([4, 2]);

    expect((await a.client.get('/api/v1/replays/visit_missing01')).status).toBe(404);
    expect((await a.client.get('/api/v1/replays/..%2F..%2Fetc')).status).toBe(404);
    expect((await a.client.raw('/api/v1/replays/visit_friction1/chunks/9')).status).toBe(404);
  });
});

describe('DELETE /api/v1/replays/:visitId', () => {
  it('lets owners erase a visitor’s recording (rows, blobs, audited); members cannot', async () => {
    const a = await orgWithSite('owner@a.et', 'shop-a.et');
    await seedReplay(a.orgId, a.siteId, 'visit_forgetme1');
    const member = await inviteAndJoin(a.client, 'dev@a.et', 'member');
    expect((await member.delete('/api/v1/replays/visit_forgetme1')).status).toBe(403);

    expect((await a.client.delete('/api/v1/replays/visit_forgetme1')).status).toBe(204);
    expect((await adminQuery('select count(*)::int as n from replay_chunks')).rows[0]!.n).toBe(0);
    for (const seq of [0, 1]) {
      expect(
        await store.get(
          replayObjectKey({ orgId: a.orgId, siteId: a.siteId, visitId: 'visit_forgetme1', seq }),
        ),
      ).toBeNull();
    }
    const audit = await adminQuery(`select action, target_id from audit_log where action = 'replay.delete'`);
    expect(audit.rows).toEqual([{ action: 'replay.delete', target_id: 'visit_forgetme1' }]);
    expect((await a.client.delete('/api/v1/replays/visit_forgetme1')).status).toBe(404);
  });
});

describe('fix evidence → replays', () => {
  it('links a fix to the evidence visits that were recorded', async () => {
    const a = await orgWithSite('owner@a.et', 'shop-a.et');
    await seedReplay(a.orgId, a.siteId, 'visit_friction1', { friction: true });
    const id = await seedIssue(a.orgId, a.siteId, ['visit_never_rec', 'visit_friction1']);
    const list = FixList.parse((await a.client.get('/api/v1/fixes')).body);
    expect(list.fixes[0]!.replayIds).toEqual(['visit_friction1']);
    expect((await a.client.get(`/api/v1/fixes/${id}`)).body.fix.replayIds).toEqual(['visit_friction1']);
  });
});
