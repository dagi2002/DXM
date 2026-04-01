/**
 * DXM Pulse — Reports Page
 * Site-level report generation with executive summary, KPIs, insights,
 * top pages, and actionable recommendations.
 * Supports PDF (print) and CSV export.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  Download,
  FileText,
  Loader2,
  Printer,
} from 'lucide-react';
import { UpgradeGate } from '../components/UpgradeGate';
import { ReportView } from '../components/Reports/ReportView';
import { useAuth } from '../context/AuthContext';
import { fetchJson } from '../lib/api';
import { BILLING_FEATURES, workspaceHasFeature } from '../lib/billing';
import { markJourneyMilestone } from '../lib/workspaceSignals';
import {
  buildReport,
  buildReportCsv,
  downloadCsv,
  type Report,
  type ReportInsight,
} from '../lib/reportBuilder';
import type { ClientSiteDetail, ClientSiteSummary } from '../types';

/* ── Insight type (matches InsightsPanel) ─────────────────────────── */

interface ApiInsight {
  id: string;
  siteId: string | null;
  type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  recommendation: string | null;
  data: Record<string, unknown> | null;
  active: boolean;
  createdAt: string;
  resolvedAt: string | null;
}

/* ── Component ───────────────────────────────────────────────────── */

export const ReportsPage: React.FC = () => {
  const { workspace } = useAuth();
  const canUseReports = workspaceHasFeature(workspace?.plan || 'free', BILLING_FEATURES.reports);

  // Site list
  const [sites, setSites] = useState<ClientSiteSummary[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [isSitesLoading, setIsSitesLoading] = useState(true);

  // Report data
  const [siteDetail, setSiteDetail] = useState<ClientSiteDetail | null>(null);
  const [insights, setInsights] = useState<ApiInsight[]>([]);
  const [isReportLoading, setIsReportLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Date range
  const [dateRange] = useState<'7d' | '30d'>('7d');

  // Dropdown open
  const [isSiteDropdownOpen, setIsSiteDropdownOpen] = useState(false);

  /* ── Load sites ─────────────────────────────────────────────────── */

  useEffect(() => {
    if (!canUseReports) {
      setIsSitesLoading(false);
      return;
    }

    let mounted = true;

    void fetchJson<ClientSiteSummary[]>('/sites')
      .then((data) => {
        if (!mounted) return;
        setSites(data);
        // Auto-select first live site, or first site
        const liveSite = data.find((s) => s.trackingStatus === 'live');
        setSelectedSiteId((current) => current ?? liveSite?.id ?? data[0]?.id ?? null);
      })
      .catch(() => {
        if (mounted) setError('Failed to load sites');
      })
      .finally(() => {
        if (mounted) setIsSitesLoading(false);
      });

    return () => { mounted = false; };
  }, [canUseReports]);

  /* ── Load report data when site changes ─────────────────────────── */

  useEffect(() => {
    if (!selectedSiteId || !canUseReports) return;

    let mounted = true;
    setIsReportLoading(true);
    setError(null);

    void Promise.all([
      fetchJson<ClientSiteDetail>(`/sites/${selectedSiteId}`),
      fetchJson<ApiInsight[]>(`/insights?siteId=${selectedSiteId}`).catch(() => [] as ApiInsight[]),
    ])
      .then(([detail, insightsData]) => {
        if (!mounted) return;
        setSiteDetail(detail);
        setInsights(insightsData);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Failed to load report data');
      })
      .finally(() => {
        if (mounted) setIsReportLoading(false);
      });

    return () => { mounted = false; };
  }, [selectedSiteId, canUseReports]);

  /* ── Build report ──────────────────────────────────────────────── */

  const report: Report | null = useMemo(() => {
    if (!siteDetail) return null;

    const reportInsights: ReportInsight[] = insights
      .filter((i) => i.active)
      .map((i) => ({
        title: i.title,
        severity: i.severity,
        description: i.description,
        recommendation: i.recommendation,
      }));

    // Heuristic: if no active insights but sessions exist, surface a positive signal
    if (reportInsights.length === 0 && siteDetail.sessionCount7d > 0) {
      reportInsights.push({
        title: 'No issues detected this week',
        severity: 'info',
        description: 'All sessions completed without triggering alerts — a positive signal for this site.',
        recommendation: 'Continue monitoring. As session volume grows, check for emerging patterns.',
      });
    }

    return buildReport({ site: siteDetail, insights: reportInsights });
  }, [siteDetail, insights]);

  /* ── Selected site info ─────────────────────────────────────────── */

  const selectedSite = useMemo(
    () => sites.find((s) => s.id === selectedSiteId) ?? null,
    [sites, selectedSiteId],
  );

  const dateRangeLabel = dateRange === '7d' ? 'Last 7 days' : 'Last 30 days';

  /* ── Export handlers ────────────────────────────────────────────── */

  const handlePrint = () => {
    void markJourneyMilestone('report_exported').catch(() => {});
    window.print();
  };

  const handleCsvExport = () => {
    if (!report || !selectedSite) return;
    void markJourneyMilestone('report_exported').catch(() => {});
    const csv = buildReportCsv(report, selectedSite.domain);
    const date = new Date().toISOString().split('T')[0];
    downloadCsv(csv, `${selectedSite.domain}-report-${date}.csv`);
  };

  /* ── Upgrade gate ──────────────────────────────────────────────── */

  if (!canUseReports) {
    return (
      <div className="mx-auto max-w-7xl p-6 md:p-8">
        <UpgradeGate
          source="reports"
          title="Unlock reports when the portfolio story is ready to share."
          description="Reports are paid because they package live DXM telemetry into a client-facing operating narrative instead of leaving the team to assemble it by hand."
          bullets={[
            'Turn alerts, replay, and analytics into a share-ready update',
            'Keep the evaluation flow focused on free core analytics first',
          ]}
        />
      </div>
    );
  }

  /* ── Render ────────────────────────────────────────────────────── */

  return (
    <div className="dxm-report-page mx-auto max-w-5xl p-6 md:p-8">
      {/* ── Controls bar (hidden in print) ───────────────────────── */}
      <div className="dxm-print-hide rounded-[28px] border border-surface-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          {/* Left: site selector */}
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-primary-600" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-surface-500">Site Report</p>
              <p className="mt-0.5 text-sm text-surface-600">{dateRangeLabel}</p>
            </div>

            {/* Site dropdown */}
            {!isSitesLoading && sites.length > 0 && (
              <div className="relative ml-2">
                <button
                  type="button"
                  onClick={() => setIsSiteDropdownOpen(!isSiteDropdownOpen)}
                  className="inline-flex items-center gap-2 rounded-2xl border border-surface-200 bg-surface-50 px-4 py-2.5 text-sm font-semibold text-surface-800 transition hover:border-primary-300 hover:bg-white"
                >
                  <span className="max-w-[200px] truncate">{selectedSite?.domain || 'Select site'}</span>
                  <ChevronDown className={`h-4 w-4 text-surface-400 transition ${isSiteDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {isSiteDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setIsSiteDropdownOpen(false)} />
                    <div className="absolute left-0 top-full z-20 mt-2 min-w-[240px] rounded-2xl border border-surface-200 bg-white py-2 shadow-lg">
                      {sites.map((site) => (
                        <button
                          key={site.id}
                          type="button"
                          onClick={() => {
                            setSelectedSiteId(site.id);
                            setIsSiteDropdownOpen(false);
                          }}
                          className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition hover:bg-surface-50 ${
                            site.id === selectedSiteId ? 'bg-primary-50 text-primary-700 font-semibold' : 'text-surface-700'
                          }`}
                        >
                          <span
                            className={`h-2 w-2 shrink-0 rounded-full ${
                              site.trackingStatus === 'live'
                                ? 'bg-emerald-500'
                                : site.trackingStatus === 'attention'
                                ? 'bg-amber-500'
                                : 'bg-surface-300'
                            }`}
                          />
                          <span className="truncate">{site.domain}</span>
                          <span className="ml-auto text-xs text-surface-400">{site.sessionCount7d}s</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Right: export actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCsvExport}
              disabled={!report}
              className="inline-flex items-center gap-2 rounded-2xl border border-surface-200 px-4 py-2.5 text-sm font-semibold text-surface-700 transition hover:border-primary-300 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={!report}
              className="inline-flex items-center gap-2 rounded-2xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Printer className="h-4 w-4" />
              Export PDF
            </button>
          </div>
        </div>
      </div>

      {/* ── Error state ──────────────────────────────────────────── */}
      {error && (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── Loading state ────────────────────────────────────────── */}
      {(isSitesLoading || isReportLoading) && (
        <div className="mt-6 rounded-[28px] border border-surface-200 bg-white p-12 text-center shadow-sm">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary-600" />
          <p className="mt-4 text-sm text-surface-500">
            {isSitesLoading ? 'Loading sites...' : 'Generating report...'}
          </p>
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────────────── */}
      {!isSitesLoading && !isReportLoading && !error && sites.length === 0 && (
        <div className="mt-6 rounded-[28px] border border-dashed border-surface-200 bg-white p-12 text-center shadow-sm">
          <AlertTriangle className="mx-auto h-10 w-10 text-surface-300" />
          <h2 className="mt-4 text-xl font-semibold text-surface-900">No sites yet</h2>
          <p className="mt-2 text-sm text-surface-500">
            Add a client site and let DXM collect traffic before generating a report.
          </p>
        </div>
      )}

      {/* ── No data state (site exists but no sessions) ──────────── */}
      {!isSitesLoading && !isReportLoading && !error && selectedSite && report && selectedSite.sessionCount7d === 0 && (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          <strong>{selectedSite.domain}</strong> has no sessions in the last 7 days. The report below reflects the current state but will improve as traffic arrives.
        </div>
      )}

      {/* ── Report ───────────────────────────────────────────────── */}
      {!isSitesLoading && !isReportLoading && !error && report && selectedSite && (
        <div className="mt-6">
          <ReportView
            report={report}
            siteDomain={selectedSite.domain}
            dateRange={dateRangeLabel}
            aiSummary={siteDetail?.ai?.summary ?? null}
            frictionAlerts={siteDetail?.openAlertsList ?? []}
          />
        </div>
      )}
    </div>
  );
};
