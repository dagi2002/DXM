import { afterEach, describe, expect, it } from 'vitest';
import { signupAndAuthenticate } from '../helpers/auth.js';
import { createTestApp, type ApiTestContext } from '../helpers/testApp.js';

interface WorkspaceMilestoneRow {
  first_site_live_at: string | null;
  first_replay_viewed_at: string | null;
  first_alert_reviewed_at: string | null;
  first_report_exported_at: string | null;
  first_upgrade_request_at: string | null;
}

describe('workspace signals', () => {
  let context: ApiTestContext | null = null;

  afterEach(async () => {
    await context?.cleanup();
    context = null;
  });

  it('persists the fit profile from signup and exposes it in settings', async () => {
    context = await createTestApp();

    const { agent, response } = await signupAndAuthenticate(context.app, {
      agencyType: 'growth_agency',
      managedSitesBand: '3_5',
      reportingWorkflow: 'slides',
      evaluationReason: 'Need stronger client reporting and faster issue detection',
    });

    expect(response.status).toBe(201);

    const settingsResponse = await agent.get('/settings');
    expect(settingsResponse.status).toBe(200);
    expect(settingsResponse.body.fitProfile).toMatchObject({
      agencyType: 'growth_agency',
      managedSitesBand: '3_5',
      reportingWorkflow: 'slides',
      evaluationReason: 'Need stronger client reporting and faster issue detection',
    });
    expect(settingsResponse.body.fitProfile.createdAt).toBeTruthy();
    expect(settingsResponse.body.fitProfile.updatedAt).toBeTruthy();
    expect(settingsResponse.body.journey).toEqual({
      firstSiteLiveAt: null,
      firstReplayViewedAt: null,
      firstAlertReviewedAt: null,
      firstReportExportedAt: null,
      firstUpgradeRequestAt: null,
    });
  });

  it('records milestones idempotently and marks first live site after telemetry arrives', async () => {
    context = await createTestApp();

    const { agent, workspace, response } = await signupAndAuthenticate(context.app);
    expect(response.status).toBe(201);
    expect(workspace?.id).toBeTruthy();

    const replayMilestoneResponse = await agent.post('/settings/milestones/replay_viewed').send({});
    expect(replayMilestoneResponse.status).toBe(201);
    expect(replayMilestoneResponse.body.firstReplayViewedAt).toBeTruthy();

    const replayMilestoneAgainResponse = await agent
      .post('/settings/milestones/replay_viewed')
      .send({});
    expect(replayMilestoneAgainResponse.status).toBe(201);
    expect(replayMilestoneAgainResponse.body.firstReplayViewedAt).toBe(
      replayMilestoneResponse.body.firstReplayViewedAt,
    );

    const siteResponse = await agent.post('/sites').send({
      name: 'Client Signals',
      domain: 'signals.example',
    });
    expect(siteResponse.status).toBe(201);

    const collectResponse = await agent.post('/collect').send({
      sessionId: 'sess_workspace_signals_001',
      siteId: siteResponse.body.siteKey,
      completed: true,
      events: [{ type: 'pageview', ts: Date.now(), url: 'https://signals.example/' }],
      metadata: {
        url: 'https://signals.example/',
        userAgent: 'Mozilla/5.0',
        language: 'en-US',
        screen: { width: 1440, height: 900 },
      },
    });
    expect(collectResponse.status).toBe(200);

    const milestoneRow = context.db
      .prepare<[string], WorkspaceMilestoneRow>(
        `
          SELECT
            first_site_live_at,
            first_replay_viewed_at,
            first_alert_reviewed_at,
            first_report_exported_at,
            first_upgrade_request_at
          FROM workspace_milestones
          WHERE workspace_id = ?
        `,
      )
      .get(workspace!.id);

    expect(milestoneRow).toMatchObject({
      first_site_live_at: expect.any(String),
      first_replay_viewed_at: replayMilestoneResponse.body.firstReplayViewedAt,
      first_alert_reviewed_at: null,
      first_report_exported_at: null,
      first_upgrade_request_at: null,
    });

    const settingsResponse = await agent.get('/settings');
    expect(settingsResponse.status).toBe(200);
    expect(settingsResponse.body.journey.firstSiteLiveAt).toBeTruthy();
    expect(settingsResponse.body.journey.firstReplayViewedAt).toBe(
      replayMilestoneResponse.body.firstReplayViewedAt,
    );
  });
});
