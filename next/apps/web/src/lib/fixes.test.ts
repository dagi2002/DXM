import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixesQuery } from './fixes';

const respond = (body: unknown) =>
  vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(
      new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
const run = () =>
  fixesQuery('org_1').queryFn!({ signal: new AbortController().signal } as never) as Promise<{
    sample: boolean;
    fixes: { id: string }[];
  }>;

describe('fixesQuery', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reads the real feed from the API', async () => {
    const spy = respond({ fixes: [{ id: 'iss_1' }] });
    await expect(run()).resolves.toEqual({ sample: false, fixes: [{ id: 'iss_1' }] });
    expect(spy.mock.calls[0]![0]).toBe('/api/v1/fixes');
  });

  it('falls back to the sample feed while an org has no real fixes', async () => {
    respond({ fixes: [] });
    const feed = await run();
    expect(feed.sample).toBe(true);
    expect(feed.fixes.length).toBeGreaterThan(0);
    expect(feed.fixes.every((f) => f.id.startsWith('fix_'))).toBe(true);
  });
});
