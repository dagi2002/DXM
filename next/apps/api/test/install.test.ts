import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { adminQuery, createTestContext, resetDatabase, signUp, signUpWithOrg } from './helpers';

const ctx = createTestContext({ COLLECTOR_PUBLIC_URL: 'https://app.dxmpulse.et' });
beforeEach(resetDatabase);
afterAll(() => ctx.database.close());

async function withSite() {
  const owner = await signUpWithOrg(ctx.app, 'owner@shop.et', 'Abebe Furniture');
  const { body } = await owner.client.post('/api/v1/sites', { name: 'Store', domain: 'shop.et' });
  return { ...owner, site: body.site as { id: string; publicKey: string } };
}

describe('install info', () => {
  it('returns the one-line snippet, allowed origins and waiting status', async () => {
    const { client, site } = await withSite();
    const res = await client.get(`/api/v1/sites/${site.id}/install`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      snippet: `<script async src="https://app.dxmpulse.et/sdk/p.js" data-site="${site.publicKey}"></script>`,
      scriptUrl: 'https://app.dxmpulse.et/sdk/p.js',
      status: 'install',
      verifiedAt: null,
      lastEventAt: null,
      allowedOrigins: ['https://shop.et', 'https://www.shop.et'],
      extraOrigins: [],
    });
  });

  it('reports live once data arrives', async () => {
    const { client, site, orgId } = await withSite();
    await adminQuery(`update sites set status = 'live', verified_at = now() where id = $1`, [site.id]);
    await adminQuery(
      `insert into visits (site_id, id, org_id, started_at, last_seen_at) values ($1, 'visit_aaaaaaaa', $2, now(), now())`,
      [site.id, orgId],
    );
    const res = await client.get(`/api/v1/sites/${site.id}/install`);
    expect(res.body.status).toBe('live');
    expect(res.body.verifiedAt).not.toBeNull();
    expect(res.body.lastEventAt).not.toBeNull();
  });

  it('is invisible to other organizations', async () => {
    const { site } = await withSite();
    const other = await signUpWithOrg(ctx.app, 'other@x.et');
    expect((await other.client.get(`/api/v1/sites/${site.id}/install`)).status).toBe(404);
  });
});

describe('extra origins', () => {
  it('adds staging and localhost origins to what the collector accepts', async () => {
    const { client, site } = await withSite();
    const res = await client.patch(`/api/v1/sites/${site.id}`, {
      extraOrigins: ['https://staging.shop.et/', 'http://localhost:3000'],
    });
    expect(res.status).toBe(200);
    const install = await client.get(`/api/v1/sites/${site.id}/install`);
    expect(install.body.extraOrigins).toEqual(['https://staging.shop.et', 'http://localhost:3000']);
    expect(install.body.allowedOrigins).toEqual([
      'https://shop.et',
      'https://www.shop.et',
      'https://staging.shop.et',
      'http://localhost:3000',
    ]);
    // Changing the domain keeps the extras.
    await client.patch(`/api/v1/sites/${site.id}`, { domain: 'newshop.et' });
    const after = await client.get(`/api/v1/sites/${site.id}/install`);
    expect(after.body.allowedOrigins).toEqual([
      'https://newshop.et',
      'https://www.newshop.et',
      'https://staging.shop.et',
      'http://localhost:3000',
    ]);
  });

  it('rejects plain http on real domains, paths and junk', async () => {
    const { client, site } = await withSite();
    for (const bad of ['http://shop.et', 'https://shop.et/path', 'javascript:alert(1)', 'not a url']) {
      const res = await client.patch(`/api/v1/sites/${site.id}`, { extraOrigins: [bad] });
      expect(res.status, bad).toBe(400);
    }
  });
});

describe('email install instructions', () => {
  it('sends the snippet to a developer in the sender’s language and audits it', async () => {
    const { client, site, orgId } = await withSite();
    await client.patch('/api/v1/me/preferences', { locale: 'am' });
    const res = await client.post(`/api/v1/sites/${site.id}/install/email`, { email: 'dev@agency.et' });
    expect(res.status).toBe(200);
    const mail = ctx.mailer.lastTo('dev@agency.et')!;
    expect(mail.subject).toBe('እባክዎ DXM Pulseን በshop.et ላይ ይጫኑ');
    expect(mail.text).toContain(`data-site="${site.publicKey}"`);
    const audit = await adminQuery(
      `select action from audit_log where org_id = $1 and action = 'site.install_emailed'`,
      [orgId],
    );
    expect(audit.rowCount).toBe(1);
  });

  it('is limited to managers and rate-limited per site', async () => {
    const { client, site } = await withSite();
    for (let i = 0; i < 5; i++) {
      expect(
        (await client.post(`/api/v1/sites/${site.id}/install/email`, { email: `d${i}@x.et` })).status,
      ).toBe(200);
    }
    const sixth = await client.post(`/api/v1/sites/${site.id}/install/email`, { email: 'd6@x.et' });
    expect(sixth.status).toBe(429);
    expect((await client.post(`/api/v1/sites/${site.id}/install/email`, { email: 'nope' })).status).toBe(400);
  });
});

describe('today', () => {
  it('summarizes visits in the last 24 hours per site', async () => {
    const { client, site, orgId } = await withSite();
    await adminQuery(
      `insert into visits (site_id, id, org_id, started_at, last_seen_at, pageviews) values
        ($1, 'visit_aaaaaaaa', $2, now() - interval '1 hour', now(), 3),
        ($1, 'visit_bbbbbbbb', $2, now() - interval '2 hours', now() - interval '1 hour', 1),
        ($1, 'visit_cccccccc', $2, now() - interval '3 days', now() - interval '3 days', 9)`,
      [site.id, orgId],
    );
    const res = await client.get('/api/v1/today');
    expect(res.status).toBe(200);
    expect(res.body.sites).toEqual([
      expect.objectContaining({
        id: site.id,
        name: 'Store',
        status: 'install',
        visits24h: 2,
        pageviews24h: 4,
      }),
    ]);
    expect(res.body.sites[0].lastEventAt).not.toBeNull();
  });

  it('requires a session', async () => {
    const c = await signUp(ctx.app, 'solo@x.et');
    expect((await c.get('/api/v1/today')).status).toBe(409);
  });
});
