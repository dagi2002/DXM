/**
 * DXM Pulse — Report Builder
 * Transforms raw site data into a structured, comparison-aware report.
 * Derives period comparisons from recentSessions timestamps.
 * No backend logic duplicated — purely shapes existing API responses.
 */

import type { ClientSiteDetail } from '../types';

/* ── Types ────────────────────────────────────────────────────────── */

export interface ReportInsight {
  title: string;
  severity: 'info' | 'warning' | 'critical';
  description: string;
  recommendation: string | null;
}

export interface ReportMetric {
  label: string;
  value: string;
  rawValue: number;
  change: number | null;       // percentage change vs previous period, null = no data
  invertedTrend: boolean;      // true = increase is bad (e.g., bounce rate)
  tone: 'positive' | 'neutral' | 'warning';
}

export interface ReportTopPage {
  url: string;
  sessions: number;
  avgDuration: string;
  avgDurationSeconds: number;
  bounceProxy: number | null;  // % of sessions < 10s (proxy for bounce)
}

export interface ReportRecommendation {
  text: string;
  priority: 'high' | 'medium' | 'low';
  source: 'insight' | 'alert' | 'metric';
}

export interface KeyTakeaways {
  positives: string[];
  negatives: string[];
  primaryFocus: string | null;
}

export interface PrimaryAction {
  title: string;
  detail: string;
  href: string | null;  // optional link (e.g., /sessions)
}

export type ReportConfidence = 'low' | 'medium' | 'high';

export interface Report {
  summary: string;
  keyTakeaways: KeyTakeaways;
  primaryAction: PrimaryAction | null;
  confidence: ReportConfidence;
  sessionsAnalyzed: number;
  metrics: ReportMetric[];
  insights: ReportInsight[];
  topPages: ReportTopPage[];
  recommendations: ReportRecommendation[];
  generatedAt: string;
}

/* ── Input shape ──────────────────────────────────────────────────── */

export interface ReportInput {
  site: ClientSiteDetail;
  insights: ReportInsight[];
}

/* ── Helpers ──────────────────────────────────────────────────────── */

const formatDuration = (seconds: number): string => {
  if (!seconds || seconds <= 0) return '0s';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
};

const formatPercent = (value: number): string => `${(value * 100).toFixed(1)}%`;

const formatChange = (change: number): string => {
  const sign = change > 0 ? '+' : '';
  return `${sign}${change.toFixed(1)}%`;
};

const pctChange = (current: number, previous: number): number | null => {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
};

const metricTone = (
  value: number,
  goodBelow?: number,
  warnAbove?: number,
): 'positive' | 'neutral' | 'warning' => {
  if (goodBelow !== undefined && value < goodBelow) return 'positive';
  if (warnAbove !== undefined && value > warnAbove) return 'warning';
  return 'neutral';
};

/* ── Period splitting ─────────────────────────────────────────────── */

interface PeriodStats {
  sessionCount: number;
  totalDuration: number;
  avgDuration: number;
  shortSessions: number; // < 10s (bounce proxy)
}

function splitSessionsByPeriod(
  sessions: ClientSiteDetail['recentSessions'],
): { current: PeriodStats; previous: PeriodStats } {
  const now = Date.now();
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
  const cutoff = now - SEVEN_DAYS;
  const prevCutoff = now - 2 * SEVEN_DAYS;

  const current: PeriodStats = { sessionCount: 0, totalDuration: 0, avgDuration: 0, shortSessions: 0 };
  const previous: PeriodStats = { sessionCount: 0, totalDuration: 0, avgDuration: 0, shortSessions: 0 };

  for (const s of sessions) {
    const ts = s.startedAt ? new Date(s.startedAt).getTime() : new Date(s.createdAt).getTime();
    const dur = s.duration || 0;

    if (ts >= cutoff) {
      current.sessionCount++;
      current.totalDuration += dur;
      if (dur < 10) current.shortSessions++;
    } else if (ts >= prevCutoff) {
      previous.sessionCount++;
      previous.totalDuration += dur;
      if (dur < 10) previous.shortSessions++;
    }
  }

  current.avgDuration = current.sessionCount > 0 ? current.totalDuration / current.sessionCount : 0;
  previous.avgDuration = previous.sessionCount > 0 ? previous.totalDuration / previous.sessionCount : 0;

  return { current, previous };
}

/* ── Per-page analysis ───────────────────────────────────────────── */

interface PageStats {
  count: number;
  totalDuration: number;
  shortCount: number; // < 10s
}

function analyzePages(sessions: ClientSiteDetail['recentSessions']): ReportTopPage[] {
  const pageMap = new Map<string, PageStats>();

  for (const session of sessions) {
    const url = session.entryUrl || '(unknown)';
    const existing = pageMap.get(url) || { count: 0, totalDuration: 0, shortCount: 0 };
    existing.count++;
    existing.totalDuration += session.duration || 0;
    if ((session.duration || 0) < 10) existing.shortCount++;
    pageMap.set(url, existing);
  }

  return Array.from(pageMap.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 8)
    .map(([url, data]) => {
      const avgSec = data.count > 0 ? data.totalDuration / data.count : 0;
      return {
        url,
        sessions: data.count,
        avgDuration: formatDuration(avgSec),
        avgDurationSeconds: avgSec,
        bounceProxy: data.count >= 2 ? Math.round((data.shortCount / data.count) * 100) : null,
      };
    });
}

/* ── Builder ─────────────────────────────────────────────────────── */

export function buildReport(input: ReportInput): Report {
  const { site, insights } = input;
  const now = new Date().toISOString();

  // ── Period comparison ────────────────────────────────────────────
  const { current, previous } = splitSessionsByPeriod(site.recentSessions);
  const sessionChange = pctChange(current.sessionCount, previous.sessionCount);
  const durationChange = pctChange(current.avgDuration, previous.avgDuration);

  // ── Metrics with comparison ──────────────────────────────────────
  const metrics: ReportMetric[] = [
    {
      label: 'Sessions (7d)',
      value: site.sessionCount7d.toLocaleString(),
      rawValue: site.sessionCount7d,
      change: sessionChange,
      invertedTrend: false,
      tone: site.sessionCount7d > 0 ? 'neutral' : 'warning',
    },
    {
      label: 'Bounce Rate',
      value: formatPercent(site.bounceRate),
      rawValue: site.bounceRate,
      change: null, // no historical bounce rate available
      invertedTrend: true,
      tone: metricTone(site.bounceRate, 0.4, 0.7),
    },
    {
      label: 'Avg Duration',
      value: formatDuration(site.avgDurationSeconds),
      rawValue: site.avgDurationSeconds,
      change: durationChange,
      invertedTrend: true, // duration down = bad
      tone: site.avgDurationSeconds >= 60 ? 'positive' : site.avgDurationSeconds >= 30 ? 'neutral' : 'warning',
    },
    {
      label: 'Conversion Rate',
      value: formatPercent(site.conversionRate),
      rawValue: site.conversionRate,
      change: null, // no historical conversion rate available
      invertedTrend: false,
      tone: site.conversionRate > 0.02 ? 'positive' : 'neutral',
    },
    {
      label: 'Health Score',
      value: `${site.healthScore}/100`,
      rawValue: site.healthScore,
      change: null,
      invertedTrend: false,
      tone: site.healthScore >= 70 ? 'positive' : site.healthScore >= 40 ? 'neutral' : 'warning',
    },
    {
      label: 'Open Alerts',
      value: String(site.openAlerts),
      rawValue: site.openAlerts,
      change: null,
      invertedTrend: true,
      tone: site.openAlerts === 0 ? 'positive' : site.criticalAlerts > 0 ? 'warning' : 'neutral',
    },
  ];

  // ── Top pages with bounce proxy ──────────────────────────────────
  const topPages = analyzePages(site.recentSessions);

  // ── Recommendations (data-specific) ──────────────────────────────
  const recommendations: ReportRecommendation[] = [];

  // From insights — already specific
  for (const insight of insights) {
    if (insight.recommendation) {
      recommendations.push({
        text: insight.recommendation,
        priority: insight.severity === 'critical' ? 'high' : insight.severity === 'warning' ? 'medium' : 'low',
        source: 'insight',
      });
    }
  }

  // From alerts — reference specific alert
  for (const alert of site.openAlertsList.slice(0, 4)) {
    const priority = alert.severity === 'critical' || alert.severity === 'high' ? 'high' : 'medium';
    recommendations.push({
      text: `Resolve "${alert.title}" — ${alert.description || `affecting ${alert.affectedSessions} session(s)`}`,
      priority,
      source: 'alert',
    });
  }

  // From metrics — reference specific pages/values
  const highBouncePage = topPages.find((p) => p.bounceProxy !== null && p.bounceProxy >= 60);
  if (highBouncePage) {
    recommendations.push({
      text: `Reduce bounce rate on ${highBouncePage.url} (${highBouncePage.bounceProxy}% of sessions under 10s) by improving page clarity and load speed.`,
      priority: 'high',
      source: 'metric',
    });
  } else if (site.bounceRate > 0.7) {
    recommendations.push({
      text: `Overall bounce rate is ${formatPercent(site.bounceRate)}. Review landing pages for relevance, load speed, and mobile experience.`,
      priority: 'high',
      source: 'metric',
    });
  }

  const shortDurationPage = topPages.find((p) => p.avgDurationSeconds < 15 && p.sessions >= 3);
  if (shortDurationPage && site.avgDurationSeconds < 30 && site.sessionCount7d > 5) {
    recommendations.push({
      text: `Average session duration on ${shortDurationPage.url} is only ${shortDurationPage.avgDuration}. Consider improving content engagement and navigation flow on this page.`,
      priority: 'medium',
      source: 'metric',
    });
  } else if (site.avgDurationSeconds < 30 && site.sessionCount7d > 5) {
    recommendations.push({
      text: `Average session duration is ${formatDuration(site.avgDurationSeconds)} — visitors leave quickly. Improve content engagement and page flow.`,
      priority: 'medium',
      source: 'metric',
    });
  }

  if (sessionChange !== null && sessionChange < -20) {
    recommendations.push({
      text: `Traffic dropped ${Math.abs(sessionChange).toFixed(0)}% compared to the previous week. Investigate whether marketing campaigns, SEO, or technical issues are affecting visibility.`,
      priority: 'high',
      source: 'metric',
    });
  }

  if (site.sessionCount7d === 0) {
    recommendations.push({
      text: 'No sessions recorded in the last 7 days. Verify tracking script is installed and site is receiving traffic.',
      priority: 'high',
      source: 'metric',
    });
  }

  // Deduplicate + sort
  const seen = new Set<string>();
  const uniqueRecommendations = recommendations.filter((r) => {
    if (seen.has(r.text)) return false;
    seen.add(r.text);
    return true;
  });
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  uniqueRecommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  // ── Executive summary with trends ────────────────────────────────
  const summary = buildSummary(site, insights, sessionChange, durationChange, topPages);

  // ── Key takeaways ──────────────────────────────────────────────
  const keyTakeaways = buildKeyTakeaways(site, insights, sessionChange, durationChange, topPages);

  // ── Primary action ─────────────────────────────────────────────
  const primaryAction = buildPrimaryAction(insights, site, topPages, uniqueRecommendations);

  // ── Confidence ─────────────────────────────────────────────────
  const sessionsAnalyzed = site.recentSessions.length;
  const confidence: ReportConfidence = sessionsAnalyzed >= 100 ? 'high' : sessionsAnalyzed >= 30 ? 'medium' : 'low';

  return {
    summary,
    keyTakeaways,
    primaryAction,
    confidence,
    sessionsAnalyzed,
    metrics,
    insights: insights.map((i) => ({
      title: i.title,
      severity: i.severity,
      description: i.description,
      recommendation: i.recommendation,
    })),
    topPages,
    recommendations: uniqueRecommendations.slice(0, 5),
    generatedAt: now,
  };
}

/* ── Summary builder ─────────────────────────────────────────────── */

function buildSummary(
  site: ClientSiteDetail,
  insights: ReportInsight[],
  sessionChange: number | null,
  durationChange: number | null,
  topPages: ReportTopPage[],
): string {
  const parts: string[] = [];

  // Traffic with trend
  if (site.sessionCount7d > 0) {
    if (sessionChange !== null && Math.abs(sessionChange) >= 5) {
      const dir = sessionChange > 0 ? 'increased' : 'decreased';
      parts.push(`${site.domain} recorded ${site.sessionCount7d.toLocaleString()} sessions this week, ${dir} ${Math.abs(sessionChange).toFixed(0)}% compared to the previous week.`);
    } else {
      parts.push(`${site.domain} recorded ${site.sessionCount7d.toLocaleString()} sessions over the last 7 days.`);
    }
  } else {
    parts.push(`${site.domain} has no recorded sessions in the last 7 days.`);
  }

  // Find something positive + something negative
  const positiveSignals: string[] = [];
  const negativeSignals: string[] = [];

  if (site.healthScore >= 70) positiveSignals.push(`health score is strong at ${site.healthScore}/100`);
  if (sessionChange !== null && sessionChange > 10) positiveSignals.push(`traffic grew ${sessionChange.toFixed(0)}%`);
  if (site.conversionRate > 0.03) positiveSignals.push(`conversion rate is solid at ${formatPercent(site.conversionRate)}`);
  if (durationChange !== null && durationChange > 10) positiveSignals.push(`session duration improved ${durationChange.toFixed(0)}%`);

  if (site.bounceRate > 0.6) negativeSignals.push(`bounce rate is elevated at ${formatPercent(site.bounceRate)}`);
  if (site.healthScore < 40) negativeSignals.push(`health score needs attention at ${site.healthScore}/100`);
  if (sessionChange !== null && sessionChange < -10) negativeSignals.push(`traffic declined ${Math.abs(sessionChange).toFixed(0)}%`);
  if (durationChange !== null && durationChange < -15) negativeSignals.push(`average session duration dropped ${Math.abs(durationChange).toFixed(0)}%`);

  const criticalInsights = insights.filter((i) => i.severity === 'critical');
  const warningInsights = insights.filter((i) => i.severity === 'warning');
  if (criticalInsights.length > 0) {
    negativeSignals.push(`${criticalInsights.length} critical issue${criticalInsights.length > 1 ? 's' : ''} detected (${criticalInsights.map((i) => i.title.toLowerCase()).join(', ')})`);
  }

  // Compose balanced summary
  if (positiveSignals.length > 0) {
    parts.push(`On the positive side, ${positiveSignals.slice(0, 2).join(' and ')}.`);
  }

  if (negativeSignals.length > 0) {
    parts.push(`However, ${negativeSignals.slice(0, 2).join(' and ')}.`);
  } else if (warningInsights.length > 0) {
    parts.push(`${warningInsights.length} warning${warningInsights.length > 1 ? 's' : ''} flagged that should be reviewed.`);
  } else if (site.sessionCount7d > 0 && positiveSignals.length === 0) {
    parts.push('No critical issues detected during this period.');
  }

  // Page-specific callout if high bounce page exists
  const problemPage = topPages.find((p) => p.bounceProxy !== null && p.bounceProxy >= 60);
  if (problemPage) {
    parts.push(`${problemPage.url} shows ${problemPage.bounceProxy}% of sessions under 10 seconds — this page may need UX attention.`);
  }

  return parts.join(' ');
}

/* ── Key takeaways builder ────────────────────────────────────────── */

function buildKeyTakeaways(
  site: ClientSiteDetail,
  insights: ReportInsight[],
  sessionChange: number | null,
  durationChange: number | null,
  topPages: ReportTopPage[],
): KeyTakeaways {
  const positives: string[] = [];
  const negatives: string[] = [];

  // Positive signals
  if (sessionChange !== null && sessionChange > 5) {
    positives.push(`Traffic increased ${sessionChange.toFixed(0)}% vs last week`);
  }
  if (site.healthScore >= 70) {
    positives.push(`Health score is strong at ${site.healthScore}/100`);
  }
  if (site.conversionRate > 0.03) {
    positives.push(`Conversion rate at ${formatPercent(site.conversionRate)}`);
  }
  if (durationChange !== null && durationChange > 10) {
    positives.push(`Session duration improved ${durationChange.toFixed(0)}%`);
  }
  if (site.openAlerts === 0 && site.sessionCount7d > 0) {
    positives.push('No open alerts');
  }
  if (site.bounceRate < 0.4 && site.sessionCount7d > 5) {
    positives.push(`Low bounce rate at ${formatPercent(site.bounceRate)}`);
  }

  // Negative signals
  const highBouncePage = topPages.find((p) => p.bounceProxy !== null && p.bounceProxy >= 60);
  if (highBouncePage) {
    negatives.push(`${highBouncePage.url} has ${highBouncePage.bounceProxy}% bounce`);
  }
  if (site.bounceRate > 0.6) {
    negatives.push(`Bounce rate elevated at ${formatPercent(site.bounceRate)}`);
  }
  if (sessionChange !== null && sessionChange < -10) {
    negatives.push(`Traffic dropped ${Math.abs(sessionChange).toFixed(0)}% vs last week`);
  }
  if (site.healthScore < 40) {
    negatives.push(`Health score critically low at ${site.healthScore}/100`);
  }
  if (durationChange !== null && durationChange < -15) {
    negatives.push(`Session duration dropped ${Math.abs(durationChange).toFixed(0)}%`);
  }

  const criticalInsights = insights.filter((i) => i.severity === 'critical');
  for (const ci of criticalInsights.slice(0, 2)) {
    negatives.push(ci.title);
  }

  if (site.criticalAlerts > 0) {
    negatives.push(`${site.criticalAlerts} critical alert${site.criticalAlerts > 1 ? 's' : ''} unresolved`);
  }

  // Ensure at least 1 of each
  if (positives.length === 0 && site.sessionCount7d > 0) {
    positives.push(`${site.sessionCount7d.toLocaleString()} sessions recorded this week`);
  }
  if (negatives.length === 0) {
    negatives.push('No significant issues detected');
  }

  // Primary focus = highest priority negative
  let primaryFocus: string | null = null;
  if (criticalInsights.length > 0) {
    primaryFocus = `Fix: ${criticalInsights[0].title}`;
  } else if (highBouncePage) {
    primaryFocus = `Fix: ${highBouncePage.url} bounce issue`;
  } else if (site.healthScore < 40) {
    primaryFocus = 'Improve overall site health';
  } else if (sessionChange !== null && sessionChange < -20) {
    primaryFocus = 'Investigate traffic decline';
  }

  return {
    positives: positives.slice(0, 2),
    negatives: negatives.slice(0, 2),
    primaryFocus,
  };
}

/* ── Primary action builder ──────────────────────────────────────── */

function buildPrimaryAction(
  insights: ReportInsight[],
  site: ClientSiteDetail,
  topPages: ReportTopPage[],
  recommendations: ReportRecommendation[],
): PrimaryAction | null {
  // 1. Critical insight with recommendation
  const critical = insights.find((i) => i.severity === 'critical' && i.recommendation);
  if (critical) {
    return {
      title: critical.title,
      detail: critical.recommendation!,
      href: '/sessions',
    };
  }

  // 2. High bounce page
  const bouncePage = topPages.find((p) => p.bounceProxy !== null && p.bounceProxy >= 60);
  if (bouncePage) {
    return {
      title: `Fix ${bouncePage.url} bounce issue (${bouncePage.bounceProxy}%)`,
      detail: `${bouncePage.bounceProxy}% of sessions on this page last under 10 seconds. Improve page clarity, reduce load time, and check mobile experience.`,
      href: '/sessions',
    };
  }

  // 3. Critical alert
  const criticalAlert = site.openAlertsList.find((a) => a.severity === 'critical');
  if (criticalAlert) {
    return {
      title: `Resolve: ${criticalAlert.title}`,
      detail: criticalAlert.description || `Affecting ${criticalAlert.affectedSessions} session(s)`,
      href: '/alerts',
    };
  }

  // 4. Highest priority recommendation
  const topRec = recommendations[0];
  if (topRec && topRec.priority === 'high') {
    return {
      title: 'Priority action needed',
      detail: topRec.text,
      href: null,
    };
  }

  return null;
}

/* ── CSV export ──────────────────────────────────────────────────── */

export function buildReportCsv(report: Report, _siteDomain: string): string {
  const lines: string[] = [];

  lines.push('Section,Label,Value,Change,Detail');

  // Metrics
  for (const m of report.metrics) {
    const changeStr = m.change !== null ? formatChange(m.change) : 'N/A';
    lines.push(`Metrics,${csvEscape(m.label)},${csvEscape(m.value)},${changeStr},${m.tone}`);
  }

  // Top Pages
  for (const p of report.topPages) {
    const bounceStr = p.bounceProxy !== null ? `${p.bounceProxy}% bounce proxy` : '';
    lines.push(`Top Pages,${csvEscape(p.url)},${p.sessions} sessions,${csvEscape(p.avgDuration)} avg,${csvEscape(bounceStr)}`);
  }

  // Insights
  for (const i of report.insights) {
    lines.push(`Insights,${csvEscape(i.title)},${i.severity},,${csvEscape(i.description)}`);
  }

  // Recommendations
  for (const r of report.recommendations) {
    lines.push(`Recommendations,${csvEscape(r.text)},${r.priority},,${r.source}`);
  }

  return lines.join('\n');
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
