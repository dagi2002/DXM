import { afterEach, describe, expect, it } from 'vitest';
import { signupAndAuthenticate } from '../helpers/auth.js';
import { setWorkspacePlan } from '../helpers/billing.js';
import { createTestApp, type ApiTestContext } from '../helpers/testApp.js';

describe('billing upgrade requests', () => {
  let context: ApiTestContext | null = null;

  afterEach(async () => {
    await context?.cleanup();
    context = null;
  });

  it('logs upgrade intent and marks the request activated once the workspace plan changes', async () => {
    context = await createTestApp();

    const { agent, workspace, response } = await signupAndAuthenticate(context.app);
    expect(response.status).toBe(201);
    expect(workspace?.id).toBeTruthy();

    const siteResponse = await agent.post('/sites').send({
      name: 'Upgrade Trigger Site',
      domain: 'upgrade.example',
    });
    expect(siteResponse.status).toBe(201);

    const requestResponse = await agent.post('/billing/upgrade-requests').send({
      requestedPlan: 'starter',
      source: 'site_limit',
      notes: 'The free plan cap is blocking a second client site.',
    });

    expect(requestResponse.status).toBe(201);
    expect(requestResponse.body).toMatchObject({
      currentPlan: 'free',
      requestedPlan: 'starter',
      source: 'site_limit',
      status: 'requested',
      siteCountAtRequest: 1,
      siteLimitAtRequest: 1,
      notes: 'The free plan cap is blocking a second client site.',
    });
    expect(requestResponse.body.id).toMatch(/^upg_/);

    const requestsResponse = await agent.get('/billing/upgrade-requests');
    expect(requestsResponse.status).toBe(200);
    expect(requestsResponse.body).toHaveLength(1);
    expect(requestsResponse.body[0]).toMatchObject({
      id: requestResponse.body.id,
      status: 'requested',
    });

    const settingsResponse = await agent.get('/settings');
    expect(settingsResponse.status).toBe(200);
    expect(settingsResponse.body.journey.firstUpgradeRequestAt).toBeTruthy();

    setWorkspacePlan(context.db, workspace!.id, 'starter');

    const activatedRequestsResponse = await agent.get('/billing/upgrade-requests');
    expect(activatedRequestsResponse.status).toBe(200);
    expect(activatedRequestsResponse.body[0]).toMatchObject({
      id: requestResponse.body.id,
      requestedPlan: 'starter',
      status: 'activated',
    });
    expect(activatedRequestsResponse.body[0].activatedAt).toBeTruthy();
  });
});
