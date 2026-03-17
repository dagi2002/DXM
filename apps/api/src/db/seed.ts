/**
 * DXM Pulse — Seed Script
 * Creates a demo workspace, user, and site with realistic session data.
 * Run: npx ts-node src/db/seed.ts
 * Safe to run multiple times — checks for existing seed data first.
 */
import { db } from './index.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

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

// ── Helpers ──────────────────────────────────────────────────────────────────

const NOW = Date.now();
const DAY = 86400000;
const HOUR = 3600000;
const MINUTE = 60000;
const SECOND = 1000;

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function uuid(): string {
  return crypto.randomUUID();
}

// Weighted random pick
function weightedPick<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

// ── Data pools ───────────────────────────────────────────────────────────────

const DEVICES: string[] = ['mobile', 'desktop', 'tablet'];
const DEVICE_WEIGHTS = [60, 30, 10]; // 60% mobile, 30% desktop, 10% tablet

const BROWSERS: string[] = ['Chrome', 'Safari', 'Firefox', 'Edge'];
const BROWSER_WEIGHTS = [70, 15, 10, 5];

const SCREEN_SIZES: Record<string, [number, number]> = {
  mobile: [390, 844],
  desktop: [1920, 1080],
  tablet: [768, 1024],
};

const PAGES = [
  'https://demostore.et/',
  'https://demostore.et/products',
  'https://demostore.et/category/traditional',
  'https://demostore.et/product/injera-basket',
  'https://demostore.et/product/habesha-kemis',
  'https://demostore.et/product/coffee-set',
  'https://demostore.et/cart',
  'https://demostore.et/checkout',
  'https://demostore.et/about',
  'https://demostore.et/contact',
  'https://demostore.et/register',
  'https://demostore.et/verify',
  'https://demostore.et/dashboard',
  'https://demostore.et/thank-you',
];

const ENTRY_URLS = [
  'https://demostore.et/',
  'https://demostore.et/products',
  'https://demostore.et/category/traditional',
  'https://demostore.et/product/injera-basket',
  'https://demostore.et/about',
];

const CLICK_TARGETS = [
  'BUTTON.add-to-cart',
  'BUTTON.checkout',
  'A.nav-link',
  'A.product-card',
  'BUTTON.submit',
  'INPUT.search',
  'BUTTON.contact-submit',
  'A.category-link',
  'BUTTON.quantity-increase',
  'DIV.product-image',
];

const LANGUAGES = ['am', 'en', 'am', 'am', 'en']; // 60% Amharic, 40% English

db.transaction(() => {
  // ── Workspace ────────────────────────────────────────────────────────────
  db.prepare(`
    INSERT INTO workspaces (id, name, plan, billing_status)
    VALUES (?, ?, 'starter', 'active')
  `).run(DEMO_WORKSPACE_ID, 'Demo Store (Ethiopia)');

  // ── Owner user ───────────────────────────────────────────────────────────
  const userId = 'usr_demo_00001';
  db.prepare(`
    INSERT INTO users (id, workspace_id, name, email, password_hash, role)
    VALUES (?, ?, 'Abebe Kebede', ?, ?, 'owner')
  `).run(userId, DEMO_WORKSPACE_ID, DEMO_USER_EMAIL, passwordHash);

  // ── Site ─────────────────────────────────────────────────────────────────
  const siteId = 'site_demo_00001';
  db.prepare(`
    INSERT INTO sites (id, workspace_id, name, domain, site_key)
    VALUES (?, ?, 'Demo Store', 'demostore.et', ?)
  `).run(siteId, DEMO_WORKSPACE_ID, DEMO_SITE_KEY);

  // ── Prepared statements ──────────────────────────────────────────────────
  const insertSession = db.prepare(`
    INSERT INTO sessions (id, site_id, workspace_id, started_at, ended_at, duration,
      device, browser, language, screen_width, screen_height, entry_url,
      clicks, scroll_depth, total_events, bounced, completed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertEvent = db.prepare(`
    INSERT INTO events (session_id, type, ts, x, y, target, url, value_text)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAlert = db.prepare(`
    INSERT INTO alerts (id, workspace_id, site_id, type, severity, title, description, resolved, affected_sessions)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertFunnel = db.prepare(`
    INSERT INTO funnels (id, workspace_id, site_id, name, steps_json)
    VALUES (?, ?, ?, ?, ?)
  `);

  // ── Generate 55 sessions across 7 days ───────────────────────────────────
  const SESSION_COUNT = 55;

  for (let i = 0; i < SESSION_COUNT; i++) {
    const sessId = `sess_demo_${String(i + 1).padStart(5, '0')}`;
    const device = weightedPick(DEVICES, DEVICE_WEIGHTS);
    const browser = weightedPick(BROWSERS, BROWSER_WEIGHTS);
    const [sw, sh] = SCREEN_SIZES[device];
    const lang = pick(LANGUAGES);
    const entryUrl = pick(ENTRY_URLS);

    // Spread across 7 days with realistic time-of-day (6am-11pm Ethiopian time)
    const dayOffset = randomInt(0, 6);
    const hourOffset = randomInt(6, 23);
    const minuteOffset = randomInt(0, 59);
    const startTs = NOW - dayOffset * DAY - (23 - hourOffset) * HOUR - minuteOffset * MINUTE;

    const durationSec = randomInt(15, 720); // 15 seconds to 12 minutes
    const endTs = startTs + durationSec * SECOND;

    const bounced = durationSec < 30 ? 1 : (Math.random() < 0.2 ? 1 : 0);
    const completed = !bounced && Math.random() < 0.3 ? 1 : 0;

    // Determine page visit count based on bounce and duration
    const pageCount = bounced ? 1 : randomInt(2, 8);
    const clickCount = bounced ? randomInt(0, 2) : randomInt(3, 25);
    const scrollDepth = bounced ? randomInt(5, 30) : randomInt(20, 100);
    const totalEvents = clickCount + pageCount + randomInt(2, 8); // clicks + pages + vitals

    // Determine if this is a rage-click session (sessions 1-7 get rage clicks)
    const isRageClickSession = i < 7;
    // Determine if this session has slow vitals (sessions 8-15)
    const isSlowVitals = i >= 8 && i < 16;

    insertSession.run(
      sessId, siteId, DEMO_WORKSPACE_ID,
      new Date(startTs).toISOString(),
      new Date(endTs).toISOString(),
      durationSec,
      device, browser, lang, sw, sh, entryUrl,
      clickCount, scrollDepth, totalEvents, bounced, completed
    );

    // ── Navigation events ────────────────────────────────────────────────
    const visitedPages = [entryUrl];
    for (let p = 1; p < pageCount; p++) {
      let nextPage = pick(PAGES);
      while (nextPage === visitedPages[visitedPages.length - 1]) {
        nextPage = pick(PAGES);
      }
      visitedPages.push(nextPage);
    }

    for (let p = 0; p < visitedPages.length; p++) {
      const navTs = startTs + Math.floor((durationSec * SECOND * p) / pageCount);
      insertEvent.run(sessId, 'navigation', navTs, null, null, null, visitedPages[p], null);
    }

    // ── Click events ─────────────────────────────────────────────────────
    if (isRageClickSession) {
      // Rage click sessions: 3+ fast clicks on same target within ~2 seconds
      const rageTarget = i < 4 ? 'BUTTON.add-to-cart' : 'BUTTON.checkout';
      const ragePage = i < 4
        ? 'https://demostore.et/product/injera-basket'
        : 'https://demostore.et/checkout';
      const rageStartTs = startTs + randomInt(10, 60) * SECOND;
      const rageClickCount = randomInt(4, 8);

      for (let r = 0; r < rageClickCount; r++) {
        const clickTs = rageStartTs + r * randomInt(200, 500); // 200-500ms apart
        insertEvent.run(
          sessId, 'click', clickTs,
          randomInt(100, 300), randomInt(400, 600),
          rageTarget, ragePage, null
        );
      }

      // Add some normal clicks too
      for (let k = 0; k < randomInt(2, 5); k++) {
        const clickTs = startTs + randomInt(60, durationSec) * SECOND;
        insertEvent.run(
          sessId, 'click', clickTs,
          randomInt(0, sw), randomInt(0, sh),
          pick(CLICK_TARGETS), pick(visitedPages), null
        );
      }
    } else {
      // Normal click distribution
      for (let k = 0; k < clickCount; k++) {
        const clickTs = startTs + randomInt(5, durationSec) * SECOND;
        insertEvent.run(
          sessId, 'click', clickTs,
          randomInt(0, sw), randomInt(0, sh),
          pick(CLICK_TARGETS), pick(visitedPages), null
        );
      }
    }

    // ── Web vitals ───────────────────────────────────────────────────────
    const lcpBase = isSlowVitals ? randomInt(4200, 7500) : randomInt(1200, 2800);
    const fcpBase = isSlowVitals ? randomInt(2000, 4000) : randomInt(600, 1500);
    const clsBase = isSlowVitals ? (0.15 + Math.random() * 0.2) : (0.02 + Math.random() * 0.08);
    const ttfbBase = isSlowVitals ? randomInt(800, 2500) : randomInt(200, 600);

    const vitals = [
      { name: 'LCP', value: String(lcpBase) },
      { name: 'FCP', value: String(fcpBase) },
      { name: 'CLS', value: String(clsBase.toFixed(3)) },
      { name: 'TTFB', value: String(ttfbBase) },
    ];

    for (const v of vitals) {
      insertEvent.run(
        sessId, 'vital', startTs + randomInt(1, 5) * SECOND,
        null, null, null, entryUrl, `${v.name}:${v.value}`
      );
    }

    // ── Scroll events ────────────────────────────────────────────────────
    if (!bounced) {
      const scrollEvents = randomInt(2, 5);
      for (let s = 0; s < scrollEvents; s++) {
        const scrollTs = startTs + randomInt(5, durationSec) * SECOND;
        const depth = randomInt(10, scrollDepth);
        insertEvent.run(
          sessId, 'scroll', scrollTs,
          null, null, null, pick(visitedPages), String(depth)
        );
      }
    }
  }

  // ── Funnels ──────────────────────────────────────────────────────────────
  insertFunnel.run(
    uuid(), DEMO_WORKSPACE_ID, siteId,
    'Purchase Flow',
    JSON.stringify([
      { name: 'Landing', urlPattern: '/' },
      { name: 'Browse Products', urlPattern: '/products' },
      { name: 'View Cart', urlPattern: '/cart' },
      { name: 'Checkout', urlPattern: '/checkout' },
      { name: 'Thank You', urlPattern: '/thank-you' },
    ])
  );

  insertFunnel.run(
    uuid(), DEMO_WORKSPACE_ID, siteId,
    'Registration Flow',
    JSON.stringify([
      { name: 'Landing', urlPattern: '/' },
      { name: 'Register', urlPattern: '/register' },
      { name: 'Verify Email', urlPattern: '/verify' },
      { name: 'Dashboard', urlPattern: '/dashboard' },
    ])
  );

  // ── Alerts ───────────────────────────────────────────────────────────────
  const alertData = [
    {
      id: uuid(),
      type: 'frustration',
      severity: 'high',
      title: 'Rage clicks on checkout button',
      description: 'Users are repeatedly clicking the checkout button without response. 7 sessions affected in the last 24 hours. The button may be unresponsive on mobile devices.',
      resolved: 0,
      affected_sessions: 7,
    },
    {
      id: uuid(),
      type: 'performance',
      severity: 'high',
      title: 'Slow page load on product pages',
      description: 'Product pages are loading with LCP > 4000ms, significantly above the 2500ms threshold. Primarily affecting mobile users on slower connections.',
      resolved: 0,
      affected_sessions: 42,
    },
    {
      id: uuid(),
      type: 'conversion',
      severity: 'medium',
      title: 'High bounce rate on landing page',
      description: 'Landing page bounce rate has increased to 68% over the past 3 days. Users are leaving without interacting with any elements.',
      resolved: 0,
      affected_sessions: 31,
    },
    {
      id: uuid(),
      type: 'performance',
      severity: 'medium',
      title: 'Slow LCP on mobile devices',
      description: 'Mobile Largest Contentful Paint averaging 5200ms across 8 sessions today. Desktop LCP remains healthy at 1800ms.',
      resolved: 0,
      affected_sessions: 8,
    },
    {
      id: uuid(),
      type: 'frustration',
      severity: 'medium',
      title: 'Rage clicks on contact form',
      description: 'Users clicking the submit button on /contact multiple times. Form validation may not be providing visible feedback.',
      resolved: 1,
      affected_sessions: 12,
    },
  ];

  for (const a of alertData) {
    insertAlert.run(
      a.id, DEMO_WORKSPACE_ID, siteId,
      a.type, a.severity, a.title, a.description,
      a.resolved, a.affected_sessions
    );
  }
})();

console.log(`✅ Seed complete.`);
console.log(`   Workspace: ${DEMO_WORKSPACE_ID}`);
console.log(`   Login:     ${DEMO_USER_EMAIL} / demo1234`);
console.log(`   Site key:  ${DEMO_SITE_KEY}`);
console.log(`   Sessions:  55 across 7 days`);
console.log(`   Funnels:   2 (Purchase Flow, Registration Flow)`);
console.log(`   Alerts:    5 (4 active, 1 resolved)`);
