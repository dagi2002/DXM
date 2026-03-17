/**
 * DXM Pulse — Seed Script
 * Creates a demo workspace, user, and site with realistic session data.
 * Run: npx ts-node src/db/seed.ts
 * Safe to run multiple times — checks for existing seed data first.
 */
import { db } from './index.js';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';

const DEMO_WORKSPACE_ID = 'ws_demo_0000';
const DEMO_USER_EMAIL = 'demo@dxmpulse.com';
const DEMO_SITE_KEY = 'demo_site_key_01';

function alreadySeeded(): boolean {
  const row = db.prepare('SELECT id FROM workspaces WHERE id = ?').get(DEMO_WORKSPACE_ID);
  return !!row;
}

if (alreadySeeded()) {
  console.log('ℹ️  Seed data already exists — skipping.');
  process.exit(0);
}

const passwordHash = bcrypt.hashSync('demo1234', 10);

db.transaction(() => {
  // Workspace
  db.prepare(`
    INSERT INTO workspaces (id, name, plan, billing_status)
    VALUES (?, ?, 'starter', 'active')
  `).run(DEMO_WORKSPACE_ID, 'Demo Store (Ethiopia)');

  // Owner user
  const userId = 'usr_demo_00001';
  db.prepare(`
    INSERT INTO users (id, workspace_id, name, email, password_hash, role)
    VALUES (?, ?, 'Abebe Kebede', ?, ?, 'owner')
  `).run(userId, DEMO_WORKSPACE_ID, DEMO_USER_EMAIL, passwordHash);

  // Site
  const siteId = 'site_demo_00001';
  db.prepare(`
    INSERT INTO sites (id, workspace_id, name, domain, site_key)
    VALUES (?, ?, 'Demo Store', 'demostore.et', ?)
  `).run(siteId, DEMO_WORKSPACE_ID, DEMO_SITE_KEY);

  // Sample sessions (3 demo sessions)
  const devices = ['mobile', 'desktop', 'mobile'] as const;
  const browsers = ['Chrome', 'Firefox', 'Safari'] as const;
  const urls = ['https://demostore.et/', 'https://demostore.et/products', 'https://demostore.et/cart'];

  for (let i = 0; i < 3; i++) {
    const sessId = `sess_demo_${String(i + 1).padStart(5, '0')}`;
    const startedAt = new Date(Date.now() - (i + 1) * 3600000).toISOString();
    const endedAt = new Date(Date.now() - (i + 1) * 3600000 + 240000).toISOString();
    db.prepare(`
      INSERT INTO sessions (id, site_id, workspace_id, started_at, ended_at, duration,
        device, browser, language, screen_width, screen_height, entry_url,
        clicks, scroll_depth, total_events, bounced, completed)
      VALUES (?, ?, ?, ?, ?, 240, ?, ?, 'am', 390, 844, ?, ?, 820, 45, 0, 1)
    `).run(sessId, siteId, DEMO_WORKSPACE_ID, startedAt, endedAt,
           devices[i], browsers[i], urls[i], 8 + i * 3);

    // Navigation events
    const pages = [urls[i], urls[i] + '/category', urls[i] + '/checkout'];
    for (let j = 0; j < pages.length; j++) {
      db.prepare(`
        INSERT INTO events (session_id, type, ts, url)
        VALUES (?, 'navigation', ?, ?)
      `).run(sessId, Date.now() - (i + 1) * 3600000 + j * 60000, pages[j]);
    }

    // Click events
    for (let k = 0; k < 8; k++) {
      db.prepare(`
        INSERT INTO events (session_id, type, ts, x, y, target)
        VALUES (?, 'click', ?, ?, ?, 'BUTTON.add-to-cart')
      `).run(sessId, Date.now() - (i + 1) * 3600000 + k * 20000,
             Math.floor(Math.random() * 390), Math.floor(Math.random() * 844));
    }

    // Web vitals
    const vitals = [
      { name: 'LCP', value: String(1800 + i * 200) },
      { name: 'FCP', value: String(900 + i * 100) },
      { name: 'CLS', value: String(0.04 + i * 0.01) },
      { name: 'TTFB', value: String(380 + i * 60) },
    ];
    for (const v of vitals) {
      db.prepare(`
        INSERT INTO events (session_id, type, ts, value_text)
        VALUES (?, 'vital', ?, ?)
      `).run(sessId, Date.now() - (i + 1) * 3600000, `${v.name}:${v.value}`);
    }
  }

  // Sample alerts
  const alertData = [
    {
      id: 'alert_demo_001', type: 'performance', severity: 'high',
      title: 'Slow Checkout Page', description: 'LCP on /checkout exceeds 4s — affecting 98 sessions.',
      resolved: 0, affected_sessions: 98,
    },
    {
      id: 'alert_demo_002', type: 'frustration', severity: 'medium',
      title: 'Rage Clicks on Pricing Toggle', description: 'Users clicking pricing toggle repeatedly — likely broken interaction.',
      resolved: 0, affected_sessions: 54,
    },
  ];
  for (const a of alertData) {
    db.prepare(`
      INSERT INTO alerts (id, workspace_id, site_id, type, severity, title, description, resolved, affected_sessions)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(a.id, DEMO_WORKSPACE_ID, 'site_demo_00001',
           a.type, a.severity, a.title, a.description, a.resolved, a.affected_sessions);
  }
})();

console.log(`✅ Seed complete.`);
console.log(`   Workspace: ${DEMO_WORKSPACE_ID}`);
console.log(`   Login:     ${DEMO_USER_EMAIL} / demo1234`);
console.log(`   Site key:  ${DEMO_SITE_KEY}`);
