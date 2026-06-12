/**
 * SharedReportPage — public read-only client report at /r/:token.
 *
 * Fetches the whitelisted payload from GET /public/reports/:token (no auth,
 * no cookies) and renders the same ReportView the dashboard uses. Agencies
 * send these links to clients; print-to-PDF still works, everything else is
 * stripped.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FileText, Loader2, Printer, Zap } from 'lucide-react';
import { ReportView } from '../components/Reports/ReportView';
import { getApiUrl } from '../lib/api';
import {
  buildReport,
  type Report,
  type ReportInsight,
} from '../lib/reportBuilder';
import type { ClientSiteDetail } from '../types';

interface PublicInsight {
  id: string;
  type: string;
  severity: string;
  title: string;
  description: string;
  recommendation: string | null;
  createdAt: string;
}

interface PublicReportPayload {
  site: Omit<ClientSiteDetail, 'siteKey' | 'snippet' | 'funnels'> & { ai?: { summary: string } };
  insights: PublicInsight[];
  workspaceName: string;
  generatedAt: string;
  expiresAt: string;
}

export const SharedReportPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [payload, setPayload] = useState<PublicReportPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('not_found');
      return;
    }
    // Plain fetch without credentials — this is a public, cookie-free page.
    fetch(getApiUrl(`/public/reports/${encodeURIComponent(token)}`))
      .then(async (res) => {
        if (!res.ok) throw new Error('not_found');
        setPayload((await res.json()) as PublicReportPayload);
      })
      .catch(() => setError('not_found'));
  }, [token]);

  const report: Report | null = useMemo(() => {
    if (!payload) return null;

    const insights: ReportInsight[] = payload.insights.map((i) => ({
      title: i.title,
      severity: (['info', 'warning', 'critical'].includes(i.severity) ? i.severity : 'info') as
        'info' | 'warning' | 'critical',
      description: i.description,
      recommendation: i.recommendation,
    }));
    if (insights.length === 0 && payload.site.sessionCount7d > 0) {
      insights.push({
        title: 'No issues detected this week',
        severity: 'info',
        description: 'All sessions completed without triggering alerts — a positive signal for this site.',
        recommendation: 'Continue monitoring. As session volume grows, check for emerging patterns.',
      });
    }

    return buildReport({ site: payload.site as unknown as ClientSiteDetail, insights });
  }, [payload]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm">
          <FileText className="mx-auto h-10 w-10 text-surface-300" />
          <h1 className="mt-4 text-xl font-semibold text-gray-900">Report not available</h1>
          <p className="mt-2 text-sm text-gray-500">
            This report link is invalid, expired, or has been revoked. Ask the agency that
            sent it for a fresh link.
          </p>
        </div>
      </div>
    );
  }

  if (!payload || !report) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-50">
      <div className="dxm-report-page mx-auto max-w-5xl p-6 md:p-8">
        {/* Header bar (hidden in print) */}
        <div className="dxm-print-hide mb-6 flex flex-col gap-4 rounded-[28px] border border-surface-200 bg-white p-5 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-surface-500">
              Client report · {payload.workspaceName}
            </p>
            <p className="mt-0.5 text-sm text-surface-600">{payload.site.domain}</p>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-700"
          >
            <Printer className="h-4 w-4" />
            Save as PDF
          </button>
        </div>

        <ReportView
          report={report}
          siteDomain={payload.site.domain}
          dateRange="Last 7 days"
          aiSummary={payload.site.ai?.summary ?? null}
          frictionAlerts={payload.site.openAlertsList ?? []}
        />

        {/* Powered-by footer */}
        <div className="mt-8 flex items-center justify-center gap-2 pb-6 text-sm text-surface-400">
          <Zap className="h-4 w-4 text-primary-500" />
          <span>
            Powered by{' '}
            <a
              href="https://dxmpulse.com"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-primary-600 hover:underline"
            >
              DXM Pulse
            </a>
          </span>
        </div>
      </div>
    </div>
  );
};
