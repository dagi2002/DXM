import { afterEach, describe, expect, it } from 'vitest';
import { signupAndAuthenticate } from '../helpers/auth.js';
import { createTestApp, type ApiTestContext } from '../helpers/testApp.js';

interface ReplayRow {
  session_id: string;
  size_bytes: number | null;
}

describe('replay ingest and read', () => {
  let context: ApiTestContext | null = null;

  afterEach(async () => {
    await context?.cleanup();
    context = null;
  });

  it('stores replay data and exposes it from the replay read model', async () => {
    context = await createTestApp();

    const { agent, response: signupResponse } = await signupAndAuthenticate(context.app);
    expect(signupResponse.status).toBe(201);

    const siteResponse = await agent.post('/sites').send({
      name: 'Replay Site',
      domain: 'https://replay.example/',
    });

    expect(siteResponse.status).toBe(201);

    const siteKey = siteResponse.body.siteKey as string;
    const sessionId = 'sess_replay_001';
    const startedAt = Date.now();

    const collectResponse = await agent.post('/collect').send({
      sessionId,
      siteId: siteKey,
      events: [
        { type: 'pageview', ts: startedAt, url: 'https://replay.example/' },
        { type: 'click', ts: startedAt + 1000, x: 42, y: 64, target: 'button.hero', url: 'https://replay.example/' },
      ],
      metadata: {
        url: 'https://replay.example/',
        userAgent: 'Mozilla/5.0',
        language: 'en-US',
        screen: { width: 1280, height: 800 },
      },
    });

    expect(collectResponse.status).toBe(200);
    expect(collectResponse.body).toEqual({ ok: true });

    const replayEvents = [
      {
        type: 2,
        timestamp: startedAt,
        data: {
          href: 'https://replay.example/',
        },
      },
      {
        type: 3,
        timestamp: startedAt + 750,
        data: {
          source: 0,
          positions: [{ x: 42, y: 64, id: 1, timeOffset: 0 }],
        },
      },
    ];

    const replayResponse = await agent.post('/collect-replay/replay').send({
      sessionId,
      siteId: siteKey,
      replayEvents,
      chunkIndex: 0,
    });

    expect(replayResponse.status).toBe(200);
    expect(replayResponse.body).toEqual({ ok: true, chunk: 0 });

    const replayRow = context.db
      .prepare<[string], ReplayRow>('SELECT session_id, size_bytes FROM session_replays WHERE session_id = ?')
      .get(sessionId);

    expect(replayRow).toMatchObject({
      session_id: sessionId,
    });
    expect(replayRow?.size_bytes).toBeGreaterThan(0);

    const sessionsResponse = await agent.get('/sessions');
    expect(sessionsResponse.status).toBe(200);
    expect(sessionsResponse.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: sessionId,
          hasReplay: true,
        }),
      ]),
    );

    const replayReadResponse = await agent.get(`/sessions/${sessionId}/replay`);
    expect(replayReadResponse.status).toBe(200);
    expect(replayReadResponse.body).toMatchObject({
      sessionId,
      sizeBytes: expect.any(Number),
      events: replayEvents,
    });
    expect(replayReadResponse.body.sizeBytes).toBeGreaterThan(0);
  });
});
