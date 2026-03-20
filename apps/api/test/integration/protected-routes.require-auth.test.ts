import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestApp, type ApiTestContext } from '../helpers/testApp.js';

describe('protected routes require auth', () => {
  let context: ApiTestContext | null = null;

  afterEach(async () => {
    await context?.cleanup();
    context = null;
  });

  it('returns 401 for protected routes without cookies', async () => {
    context = await createTestApp();

    for (const route of ['/sites', '/sessions', '/analytics/heatmap', '/overview']) {
      const response = await request(context.app).get(route);
      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Authentication required' });
    }
  });
});
