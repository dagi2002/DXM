import { afterEach, describe, expect, it } from 'vitest';
import { signupAndAuthenticate } from '../helpers/auth.js';
import { setWorkspacePlan } from '../helpers/billing.js';
import { createTestApp, type ApiTestContext } from '../helpers/testApp.js';

describe('billing plan gates', () => {
  let context: ApiTestContext | null = null;

  afterEach(async () => {
    await context?.cleanup();
    context = null;
  });

  it('blocks free workspaces from adding a second tracked site', async () => {
    context = await createTestApp();

    const { agent, workspace, response } = await signupAndAuthenticate(context.app);
    expect(response.status).toBe(201);
    expect(workspace?.id).toBeTruthy();

    const firstSite = await agent.post('/sites').send({
      name: 'Abebe Furniture',
      domain: 'abebefurniture.et',
    });

    expect(firstSite.status).toBe(201);

    const secondSite = await agent.post('/sites').send({
      name: 'Moyee Coffee',
      domain: 'moyeecoffee.et',
    });

    expect(secondSite.status).toBe(409);
    expect(secondSite.body).toMatchObject({
      code: 'plan_limit_reached',
      currentPlan: 'free',
      limitType: 'sites',
      limit: 1,
      currentCount: 1,
      upgradePlan: 'starter',
    });
  });

  it('returns billing snapshot data and blocks paid-only routes for free workspaces', async () => {
    context = await createTestApp();

    const { agent, workspace, response } = await signupAndAuthenticate(context.app);
    expect(response.status).toBe(201);
    expect(workspace?.id).toBeTruthy();

    const siteResponse = await agent.post('/sites').send({
      name: 'Abebe Furniture',
      domain: 'abebefurniture.et',
    });
    expect(siteResponse.status).toBe(201);

    const billingCurrent = await agent.get('/billing/current');
    expect(billingCurrent.status).toBe(200);
    expect(billingCurrent.body).toEqual({
      plan: 'free',
      billing_status: 'active',
      siteCount: 1,
      siteLimit: 1,
    });

    const replayResponse = await agent.get('/sessions/sess_missing/replay');
    expect(replayResponse.status).toBe(403);
    expect(replayResponse.body).toMatchObject({
      code: 'feature_not_in_plan',
      feature: 'replay',
      currentPlan: 'free',
      upgradePlan: 'starter',
    });

    const userFlowResponse = await agent.get('/analytics/userflow');
    expect(userFlowResponse.status).toBe(403);
    expect(userFlowResponse.body).toMatchObject({
      code: 'feature_not_in_plan',
      feature: 'user_flow',
    });

    const alertsResponse = await agent.get('/alerts');
    expect(alertsResponse.status).toBe(403);
    expect(alertsResponse.body).toMatchObject({
      code: 'feature_not_in_plan',
      feature: 'alerts',
    });

    const digestSettingsResponse = await agent.patch('/settings').send({
      digestEnabled: true,
      digestLanguage: 'en',
    });
    expect(digestSettingsResponse.status).toBe(403);
    expect(digestSettingsResponse.body).toMatchObject({
      code: 'feature_not_in_plan',
      feature: 'digest',
    });

    const telegramResponse = await agent.put('/settings/telegram').send({
      botToken: '1234567890:abcdefghijklmnopqrstuvwxyz',
      chatId: '123456789',
    });
    expect(telegramResponse.status).toBe(403);
    expect(telegramResponse.body).toMatchObject({
      code: 'feature_not_in_plan',
      feature: 'telegram',
    });
  });

  it('lets starter workspaces add more tracked sites and access paid routes', async () => {
    context = await createTestApp();

    const { agent, workspace, response } = await signupAndAuthenticate(context.app);
    expect(response.status).toBe(201);
    expect(workspace?.id).toBeTruthy();

    setWorkspacePlan(context.db, workspace!.id, 'starter');

    const firstSite = await agent.post('/sites').send({
      name: 'Abebe Furniture',
      domain: 'abebefurniture.et',
    });
    const secondSite = await agent.post('/sites').send({
      name: 'Moyee Coffee',
      domain: 'moyeecoffee.et',
    });

    expect(firstSite.status).toBe(201);
    expect(secondSite.status).toBe(201);

    const billingCurrent = await agent.get('/billing/current');
    expect(billingCurrent.status).toBe(200);
    expect(billingCurrent.body).toEqual({
      plan: 'starter',
      billing_status: 'active',
      siteCount: 2,
      siteLimit: 5,
    });

    const userFlowResponse = await agent.get('/analytics/userflow');
    expect(userFlowResponse.status).toBe(200);
    expect(Array.isArray(userFlowResponse.body)).toBe(true);

    const alertsResponse = await agent.get('/alerts');
    expect(alertsResponse.status).toBe(200);
    expect(Array.isArray(alertsResponse.body)).toBe(true);
  });
});
