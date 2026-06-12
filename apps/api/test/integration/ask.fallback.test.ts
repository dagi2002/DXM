import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { signupAndAuthenticate } from '../helpers/auth.js';
import { createTestApp, type ApiTestContext } from '../helpers/testApp.js';

describe('POST /ask (Ask Pulse)', () => {
  let context: ApiTestContext | null = null;

  afterEach(async () => {
    await context?.cleanup();
    context = null;
  });

  it('requires authentication', async () => {
    context = await createTestApp({ env: { ANTHROPIC_API_KEY: undefined } });

    const response = await request(context.app)
      .post('/ask')
      .send({ question: 'How are my sites doing?' });

    expect(response.status).toBe(401);
  });

  it('falls back deterministically when no Anthropic key is configured', async () => {
    context = await createTestApp({ env: { ANTHROPIC_API_KEY: undefined } });
    const { agent } = await signupAndAuthenticate(context.app);

    const response = await agent.post('/ask').send({ question: 'How are my sites doing?' });

    expect(response.status).toBe(200);
    expect(response.body.mode).toBe('fallback');
    expect(response.body.answer).toContain('Anthropic API key');
    expect(response.body.citations).toEqual([]);
    expect(response.body.toolCalls).toEqual([]);
  });

  it('validates question length', async () => {
    context = await createTestApp({ env: { ANTHROPIC_API_KEY: undefined } });
    const { agent } = await signupAndAuthenticate(context.app);

    const tooShort = await agent.post('/ask').send({ question: 'hi' });
    expect(tooShort.status).toBe(400);

    const tooLong = await agent.post('/ask').send({ question: 'x'.repeat(501) });
    expect(tooLong.status).toBe(400);
  });
});
