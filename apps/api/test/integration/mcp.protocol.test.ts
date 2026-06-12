import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { signupAndAuthenticate } from '../helpers/auth.js';
import { createTestApp, type ApiTestContext } from '../helpers/testApp.js';

const rpc = (method: string, params?: Record<string, unknown>, id: number | string = 1) => ({
  jsonrpc: '2.0' as const,
  id,
  method,
  ...(params ? { params } : {}),
});

describe('MCP protocol endpoint', () => {
  let context: ApiTestContext | null = null;

  afterEach(async () => {
    await context?.cleanup();
    context = null;
  });

  const createContext = async () =>
    createTestApp({ env: { WORKSPACE_API_PEPPER: 'test-pepper' } });

  const createKey = async (agent: ReturnType<typeof request.agent>) => {
    const created = await agent.post('/api-keys').send({ name: 'mcp test' });
    expect(created.status).toBe(201);
    return created.body.rawKey as string;
  };

  it('rejects missing, malformed, and unknown bearer tokens', async () => {
    context = await createContext();

    const missing = await request(context.app).post('/mcp').send(rpc('tools/list'));
    expect(missing.status).toBe(401);

    const malformed = await request(context.app)
      .post('/mcp')
      .set('Authorization', 'Bearer short')
      .send(rpc('tools/list'));
    expect(malformed.status).toBe(401);

    const unknown = await request(context.app)
      .post('/mcp')
      .set('Authorization', `Bearer dxm_live_${'0'.repeat(64)}`)
      .send(rpc('tools/list'));
    expect(unknown.status).toBe(401);
  });

  it('initialize handshake advertises tools capability and server info', async () => {
    context = await createContext();
    const { agent } = await signupAndAuthenticate(context.app);
    const key = await createKey(agent);

    const response = await request(context.app)
      .post('/mcp')
      .set('Authorization', `Bearer ${key}`)
      .send(rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {} }));

    expect(response.status).toBe(200);
    expect(response.body.result.protocolVersion).toBe('2024-11-05');
    expect(response.body.result.capabilities.tools).toBeDefined();
    expect(response.body.result.serverInfo.name).toBe('dxm-pulse');
  });

  it('tools/list returns the 4 read-only tools with MCP-shaped schemas', async () => {
    context = await createContext();
    const { agent } = await signupAndAuthenticate(context.app);
    const key = await createKey(agent);

    const response = await request(context.app)
      .post('/mcp')
      .set('Authorization', `Bearer ${key}`)
      .send(rpc('tools/list'));

    expect(response.status).toBe(200);
    const tools = response.body.result.tools as Array<{ name: string; inputSchema: unknown }>;
    expect(tools.map((t) => t.name).sort()).toEqual([
      'get_site_health',
      'list_sites',
      'recent_alerts',
      'search_sessions',
    ]);
    for (const tool of tools) {
      expect(tool.inputSchema).toMatchObject({ type: 'object' });
    }
  });

  it('speaks JSON-RPC: unknown method, batch rejection, notifications', async () => {
    context = await createContext();
    const { agent } = await signupAndAuthenticate(context.app);
    const key = await createKey(agent);

    const unknown = await request(context.app)
      .post('/mcp')
      .set('Authorization', `Bearer ${key}`)
      .send(rpc('definitely/not_a_method'));
    expect(unknown.body.error.code).toBe(-32601);

    const batch = await request(context.app)
      .post('/mcp')
      .set('Authorization', `Bearer ${key}`)
      .send([rpc('tools/list', undefined, 1), rpc('tools/list', undefined, 2)]);
    expect(batch.body.error.code).toBe(-32600);

    const notification = await request(context.app)
      .post('/mcp')
      .set('Authorization', `Bearer ${key}`)
      .send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    expect(notification.status).toBe(204);
  });

  it('strictly isolates workspaces: A\'s key can never read B\'s data', async () => {
    context = await createContext();

    const { agent: ownerA } = await signupAndAuthenticate(context.app);
    const { agent: ownerB } = await signupAndAuthenticate(context.app);

    const siteA = await ownerA.post('/sites').send({ name: 'Site A', domain: 'https://a.example' });
    const siteB = await ownerB.post('/sites').send({ name: 'Site B', domain: 'https://b.example' });
    expect(siteA.status).toBe(201);
    expect(siteB.status).toBe(201);

    const keyA = await createKey(ownerA);

    // list_sites with A's key only sees A's site.
    const list = await request(context.app)
      .post('/mcp')
      .set('Authorization', `Bearer ${keyA}`)
      .send(rpc('tools/call', { name: 'list_sites', arguments: {} }));
    const listPayload = JSON.parse(list.body.result.content[0].text) as Array<{ id: string; name: string }>;
    expect(listPayload.map((s) => s.name)).toEqual(['Site A']);
    expect(JSON.stringify(listPayload)).not.toContain(siteB.body.id);

    // get_site_health with B's site id through A's key → tool error, no data.
    const health = await request(context.app)
      .post('/mcp')
      .set('Authorization', `Bearer ${keyA}`)
      .send(rpc('tools/call', { name: 'get_site_health', arguments: { site_id: siteB.body.id } }));
    expect(health.body.result.isError).toBe(true);
    expect(health.body.result.content[0].text).toContain('site_not_found');

    // search_sessions never returns B's sessions even unfiltered.
    context.db.prepare(`
      INSERT INTO sessions (id, site_id, workspace_id, entry_url, device, browser)
      VALUES ('sess_b_1', ?, (SELECT workspace_id FROM sites WHERE id = ?), 'https://b.example/', 'desktop', 'Chrome')
    `).run(siteB.body.id, siteB.body.id);

    const search = await request(context.app)
      .post('/mcp')
      .set('Authorization', `Bearer ${keyA}`)
      .send(rpc('tools/call', { name: 'search_sessions', arguments: {} }));
    const sessions = JSON.parse(search.body.result.content[0].text) as Array<{ id: string }>;
    expect(sessions.find((s) => s.id === 'sess_b_1')).toBeUndefined();
  });

  it('tools/call validates the tool name and unknown tools fail soft', async () => {
    context = await createContext();
    const { agent } = await signupAndAuthenticate(context.app);
    const key = await createKey(agent);

    const noName = await request(context.app)
      .post('/mcp')
      .set('Authorization', `Bearer ${key}`)
      .send(rpc('tools/call', { arguments: {} }));
    expect(noName.body.error.code).toBe(-32602);

    const unknownTool = await request(context.app)
      .post('/mcp')
      .set('Authorization', `Bearer ${key}`)
      .send(rpc('tools/call', { name: 'drop_tables', arguments: {} }));
    expect(unknownTool.body.result.isError).toBe(true);
    expect(unknownTool.body.result.content[0].text).toContain('unknown_tool');
  });
});
