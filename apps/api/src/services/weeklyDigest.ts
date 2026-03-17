import { db } from '../db/index.js';

interface DigestData {
  totalSessions: number;
  topPages: { url: string; visits: number }[];
  alertsTriggered: number;
  bounceRate: number;
  prevBounceRate: number;
}

export function compileDigest(workspaceId: string): DigestData {
  // Query sessions from last 7 days
  const sessions = db.prepare(`
    SELECT COUNT(*) as total,
           SUM(CASE WHEN bounced = 1 THEN 1 ELSE 0 END) as bounced
    FROM sessions
    WHERE workspace_id = ? AND created_at >= datetime('now', '-7 days')
  `).get(workspaceId) as any;

  // Previous week for comparison
  const prevSessions = db.prepare(`
    SELECT COUNT(*) as total,
           SUM(CASE WHEN bounced = 1 THEN 1 ELSE 0 END) as bounced
    FROM sessions
    WHERE workspace_id = ?
    AND created_at >= datetime('now', '-14 days')
    AND created_at < datetime('now', '-7 days')
  `).get(workspaceId) as any;

  // Top pages
  const topPages = db.prepare(`
    SELECT url, COUNT(*) as visits
    FROM events
    WHERE type = 'pageview'
    AND session_id IN (SELECT id FROM sessions WHERE workspace_id = ? AND created_at >= datetime('now', '-7 days'))
    GROUP BY url
    ORDER BY visits DESC
    LIMIT 5
  `).all(workspaceId) as { url: string; visits: number }[];

  // Alerts this week
  const alertCount = db.prepare(`
    SELECT COUNT(*) as count
    FROM alerts
    WHERE workspace_id = ? AND created_at >= datetime('now', '-7 days')
  `).get(workspaceId) as any;

  const total = sessions?.total || 0;
  const bounced = sessions?.bounced || 0;
  const prevTotal = prevSessions?.total || 0;
  const prevBounced = prevSessions?.bounced || 0;

  return {
    totalSessions: total,
    topPages,
    alertsTriggered: alertCount?.count || 0,
    bounceRate: total > 0 ? Math.round((bounced / total) * 100) : 0,
    prevBounceRate: prevTotal > 0 ? Math.round((prevBounced / prevTotal) * 100) : 0,
  };
}

export function formatDigestEN(data: DigestData): string {
  const bounceChange = data.bounceRate - data.prevBounceRate;
  const bounceArrow = bounceChange > 0 ? '📈' : bounceChange < 0 ? '📉' : '➡️';

  let msg = `📊 *DXM Pulse — Weekly Report*\n\n`;
  msg += `👥 Total Sessions: *${data.totalSessions}*\n`;
  msg += `${bounceArrow} Bounce Rate: *${data.bounceRate}%* (${bounceChange >= 0 ? '+' : ''}${bounceChange}% vs last week)\n`;
  msg += `🚨 Alerts Triggered: *${data.alertsTriggered}*\n\n`;

  if (data.topPages.length > 0) {
    msg += `📄 *Top Pages:*\n`;
    data.topPages.forEach((p, i) => {
      msg += `  ${i + 1}. ${p.url} — ${p.visits} visits\n`;
    });
  }

  return msg;
}

export function formatDigestAM(data: DigestData): string {
  const bounceChange = data.bounceRate - data.prevBounceRate;
  const bounceArrow = bounceChange > 0 ? '📈' : bounceChange < 0 ? '📉' : '➡️';

  let msg = `📊 *DXM Pulse — ሳምንታዊ ሪፖርት*\n\n`;
  msg += `👥 ጠቅላላ ክፍለ ጊዜዎች: *${data.totalSessions}*\n`;
  msg += `${bounceArrow} የመመለስ ምጣኔ: *${data.bounceRate}%* (${bounceChange >= 0 ? '+' : ''}${bounceChange}% ካለፈው ሳምንት)\n`;
  msg += `🚨 ማንቂያዎች: *${data.alertsTriggered}*\n\n`;

  if (data.topPages.length > 0) {
    msg += `📄 *ከፍተኛ ገጾች:*\n`;
    data.topPages.forEach((p, i) => {
      msg += `  ${i + 1}. ${p.url} — ${p.visits} ጎብኝቶች\n`;
    });
  }

  return msg;
}
