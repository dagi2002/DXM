import { afterEach, describe, expect, it } from 'vitest';
import { signupAndAuthenticate } from '../helpers/auth.js';
import { setWorkspacePlan } from '../helpers/billing.js';
import { createTestApp, type ApiTestContext } from '../helpers/testApp.js';

/**
 * Tests the Session 3 friction detectors (dead clicks, U-turns, form abandon)
 * by seeding sessions/events directly and invoking runAlertChecks — the same
 * entry the /collect ingest path uses.
 */
describe('alertEngine friction detectors', () => {
  let context: ApiTestContext | null = null;

  afterEach(async () => {
    await context?.cleanup();
    context = null;
  });

  const setup = async () => {
    context = await createTestApp();
    const { agent, workspace } = await signupAndAuthenticate(context.app);
    const wsId = workspace!.id as string;
    setWorkspacePlan(context.db, wsId, 'starter'); // alerts are plan-gated

    const site = await agent.post('/sites').send({ name: 'Friction', domain: 'https://f.example' });
    expect(site.status).toBe(201);

    context.db.prepare(`
      INSERT INTO sessions (id, site_id, workspace_id, entry_url, device, browser)
      VALUES ('sess_f1', ?, ?, 'https://f.example/', 'desktop', 'Chrome')
    `).run(site.body.id, wsId);

    // Import after createTestApp so we get the app's module instances.
    const { runAlertChecks } = await import('../../src/services/alertEngine.js');

    return { wsId, siteId: site.body.id as string, runAlertChecks, db: context.db };
  };

  const insertEvents = (
    db: ApiTestContext['db'],
    rows: Array<{ type: string; ts: number; target?: string; url?: string }>,
  ) => {
    const insert = db.prepare(`
      INSERT INTO events (session_id, type, ts, target, url)
      VALUES ('sess_f1', ?, ?, ?, ?)
    `);
    for (const row of rows) insert.run(row.type, row.ts, row.target ?? null, row.url ?? null);
  };

  const openAlerts = (db: ApiTestContext['db'], wsId: string, title: string) =>
    db.prepare('SELECT id FROM alerts WHERE workspace_id = ? AND title = ? AND resolved = 0')
      .all(wsId, title);

  it('fires on 3+ dead clicks on the same target, not on 2', async () => {
    const { wsId, siteId, runAlertChecks, db } = await setup();
    const now = Date.now();

    insertEvents(db, [
      { type: 'dead_click', ts: now, target: 'button.checkout' },
      { type: 'dead_click', ts: now + 1000, target: 'button.checkout' },
    ]);
    await runAlertChecks(wsId, siteId);
    expect(openAlerts(db, wsId, 'Dead clicks detected')).toHaveLength(0);

    insertEvents(db, [{ type: 'dead_click', ts: now + 2000, target: 'button.checkout' }]);
    await runAlertChecks(wsId, siteId);
    expect(openAlerts(db, wsId, 'Dead clicks detected')).toHaveLength(1);
  });

  it('fires on an A→B→A U-turn within 30s, not on a slower return', async () => {
    const { wsId, siteId, runAlertChecks, db } = await setup();
    const now = Date.now();

    // Slow return (35s) — no alert.
    insertEvents(db, [
      { type: 'pageview', ts: now, url: 'https://f.example/' },
      { type: 'pageview', ts: now + 5_000, url: 'https://f.example/pricing' },
      { type: 'pageview', ts: now + 35_000, url: 'https://f.example/' },
    ]);
    await runAlertChecks(wsId, siteId);
    expect(openAlerts(db, wsId, 'Visitor U-turn detected')).toHaveLength(0);

    // Fast return (20s) in a second session — alert.
    db.prepare(`
      INSERT INTO sessions (id, site_id, workspace_id, entry_url, device, browser)
      VALUES ('sess_f2', ?, ?, 'https://f.example/', 'desktop', 'Chrome')
    `).run(siteId, wsId);
    const insert = db.prepare(`
      INSERT INTO events (session_id, type, ts, url) VALUES ('sess_f2', 'pageview', ?, ?)
    `);
    insert.run(now, 'https://f.example/');
    insert.run(now + 5_000, 'https://f.example/pricing');
    insert.run(now + 20_000, 'https://f.example/');

    await runAlertChecks(wsId, siteId);
    expect(openAlerts(db, wsId, 'Visitor U-turn detected')).toHaveLength(1);
  });

  it('fires on ≥20 form starts with >50% drop-off; respects both thresholds', async () => {
    const { wsId, siteId, runAlertChecks, db } = await setup();
    const now = Date.now();
    const url = 'https://f.example/signup';

    // 19 starts, 0 submits — under the volume threshold.
    insertEvents(
      db,
      Array.from({ length: 19 }, (_, i) => ({ type: 'form_start', ts: now + i, url })),
    );
    await runAlertChecks(wsId, siteId);
    expect(openAlerts(db, wsId, 'Form abandonment spiking')).toHaveLength(0);

    // 20th start + 10 submits — exactly 50% drop-off, threshold is strict >50%.
    insertEvents(db, [{ type: 'form_start', ts: now + 19, url }]);
    insertEvents(
      db,
      Array.from({ length: 10 }, (_, i) => ({ type: 'form_submit', ts: now + 100 + i, url })),
    );
    await runAlertChecks(wsId, siteId);
    expect(openAlerts(db, wsId, 'Form abandonment spiking')).toHaveLength(0);

    // Remove a submit → 9/20 submitted, 55% drop-off — fires.
    db.prepare("DELETE FROM events WHERE type = 'form_submit' AND id IN (SELECT id FROM events WHERE type = 'form_submit' LIMIT 1)").run();
    await runAlertChecks(wsId, siteId);
    expect(openAlerts(db, wsId, 'Form abandonment spiking')).toHaveLength(1);
  });

  it('deduplicates: running checks twice never doubles an open alert', async () => {
    const { wsId, siteId, runAlertChecks, db } = await setup();
    const now = Date.now();

    insertEvents(db, [
      { type: 'dead_click', ts: now, target: 'a.nav' },
      { type: 'dead_click', ts: now + 1, target: 'a.nav' },
      { type: 'dead_click', ts: now + 2, target: 'a.nav' },
    ]);

    await runAlertChecks(wsId, siteId);
    await runAlertChecks(wsId, siteId);

    expect(openAlerts(db, wsId, 'Dead clicks detected')).toHaveLength(1);
  });
});
