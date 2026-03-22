import { afterEach, describe, expect, it } from 'vitest';
import { signupAndAuthenticate } from '../helpers/auth.js';
import { createTestApp, type ApiTestContext } from '../helpers/testApp.js';
import { setWorkspacePlan } from '../helpers/billing.js';

const applyEmailMigrations = (db: import('better-sqlite3').Database) => {
  try { db.prepare('ALTER TABLE workspaces ADD COLUMN email_notifications_enabled INTEGER NOT NULL DEFAULT 1').run(); } catch {}
  try { db.prepare('ALTER TABLE sites ADD COLUMN first_session_at DATETIME').run(); } catch {}
};

const makeCollectPayload = (sessionId: string, siteKey: string) => ({
  sessionId,
  siteId: siteKey,
  events: [{ type: 'pageview' as const, ts: Date.now(), url: 'https://example.et/' }],
  metadata: { url: 'https://example.et/', userAgent: 'TestAgent/1.0' },
});

/** Import mailer from the same module graph as the app (after vi.resetModules). */
const getMailer = () => import('../../src/lib/mailer.js');

describe('email notifications', () => {
  let context: ApiTestContext | null = null;

  afterEach(async () => {
    await context?.cleanup();
    context = null;
  });

  it('welcome email sent on signup', async () => {
    context = await createTestApp();
    const mailer = await getMailer();
    mailer.resetSentMails();

    const { user } = await signupAndAuthenticate(context.app);

    const welcome = mailer.sentMails.find(m => m.type === 'welcome');
    expect(welcome).toBeTruthy();
    expect(welcome!.to).toBe(user!.email);
    expect(welcome!.subject).toContain('Welcome');
  });

  it('site-verified email on first session', async () => {
    context = await createTestApp();
    applyEmailMigrations(context.db);
    const mailer = await getMailer();

    const { agent } = await signupAndAuthenticate(context.app);

    // Create a site
    const siteRes = await agent.post('/sites').send({ name: 'Test Site', domain: 'example.et' });
    expect(siteRes.status).toBe(201);
    const siteKey = siteRes.body.siteKey as string;

    mailer.resetSentMails();

    // Ingest first session
    const collectRes = await agent.post('/collect').send(makeCollectPayload('sess_email_001', siteKey));
    expect(collectRes.status).toBe(200);

    const verified = mailer.sentMails.find(m => m.type === 'site_verified');
    expect(verified).toBeTruthy();
    expect(verified!.subject).toContain('example.et');
  });

  it('site-verified email NOT sent on second session', async () => {
    context = await createTestApp();
    applyEmailMigrations(context.db);
    const mailer = await getMailer();

    const { agent } = await signupAndAuthenticate(context.app);

    const siteRes = await agent.post('/sites').send({ name: 'Test Site', domain: 'example.et' });
    const siteKey = siteRes.body.siteKey as string;

    // First session
    await agent.post('/collect').send(makeCollectPayload('sess_first_notif', siteKey));

    mailer.resetSentMails();

    // Second session — should NOT trigger site-verified email
    await agent.post('/collect').send(makeCollectPayload('sess_second_notif', siteKey));

    const verified = mailer.sentMails.find(m => m.type === 'site_verified');
    expect(verified).toBeUndefined();
  });

  it('critical alert email sent', async () => {
    context = await createTestApp();
    applyEmailMigrations(context.db);
    const mailer = await getMailer();

    const { agent, workspace } = await signupAndAuthenticate(context.app);

    // Alerts require starter plan
    setWorkspacePlan(context.db, workspace!.id, 'starter');

    mailer.resetSentMails();

    const alertRes = await agent.post('/alerts').send({
      type: 'error',
      severity: 'critical',
      title: 'Server 500 spike',
      description: 'Error rate exceeded threshold',
    });
    expect(alertRes.status).toBe(201);

    const critical = mailer.sentMails.find(m => m.type === 'critical_alert');
    expect(critical).toBeTruthy();
    expect(critical!.subject).toContain('Critical alert');
    expect(critical!.text).toContain('Server 500 spike');
  });

  it('non-critical alert does NOT send email', async () => {
    context = await createTestApp();
    applyEmailMigrations(context.db);
    const mailer = await getMailer();

    const { agent, workspace } = await signupAndAuthenticate(context.app);
    setWorkspacePlan(context.db, workspace!.id, 'starter');

    mailer.resetSentMails();

    await agent.post('/alerts').send({
      type: 'performance',
      severity: 'medium',
      title: 'Slow LCP detected',
    });

    const critical = mailer.sentMails.find(m => m.type === 'critical_alert');
    expect(critical).toBeUndefined();
  });

  it('opt-out prevents notification emails', async () => {
    context = await createTestApp();
    applyEmailMigrations(context.db);
    const mailer = await getMailer();

    const { agent, workspace } = await signupAndAuthenticate(context.app);
    setWorkspacePlan(context.db, workspace!.id, 'starter');

    // Disable email notifications
    context.db.prepare('UPDATE workspaces SET email_notifications_enabled = 0 WHERE id = ?')
      .run(workspace!.id);

    // Create a site and ingest first session
    const siteRes = await agent.post('/sites').send({ name: 'Opt Out Site', domain: 'optout.et' });
    const siteKey = siteRes.body.siteKey as string;

    mailer.resetSentMails();

    await agent.post('/collect').send(makeCollectPayload('sess_optout_001', siteKey));

    // Site-verified email should NOT be sent
    const verified = mailer.sentMails.find(m => m.type === 'site_verified');
    expect(verified).toBeUndefined();

    // Critical alert email should NOT be sent
    await agent.post('/alerts').send({
      type: 'error',
      severity: 'critical',
      title: 'Critical but opted out',
    });

    const critical = mailer.sentMails.find(m => m.type === 'critical_alert');
    expect(critical).toBeUndefined();
  });
});
