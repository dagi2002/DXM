/**
 * DXM Pulse — Reports Page
 * Site-level report generation with executive summary, KPIs, insights,
 * top pages, and actionable recommendations.
 * Supports PDF (print) and CSV export.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  FileText,
  Link2,
  Loader2,
  Printer,
  X,
} from 'lucide-react';
import { UpgradeGate } from '../components/UpgradeGate';
import { ReportView } from '../components/Reports/ReportView';
import { useAuth } from '../context/useAuth';
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

interface ShareView {
  id: string;
  siteId: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
  active: boolean;
}

export const ReportsPage: React.FC = () => {
  const { workspace, user } = useAuth();
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

  // Share-link state
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [shares, setShares] = useState<ShareView[]>([]);
  const [newShareUrl, setNewShareUrl] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [copiedShare, setCopiedShare] = useState(false);
  const canManageShares = user?.role === 'owner' || user?.role === 'admin';

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

  /* ── Share-link handlers ────────────────────────────────────────── */

  const loadShares = useCallback(async () => {
    if (!selectedSiteId) return;
    try {
      const res = await fetchJson<{ shares: ShareView[] }>(`/sites/${selectedSiteId}/report-shares`);
      setShares(res.shares || []);
    } catch {
      /* non-fatal — list stays empty */
    }
  }, [selectedSiteId]);

  const handleOpenShare = () => {
    setIsShareOpen(true);
    setNewShareUrl(null);
    setShareError(null);
    void loadShares();
  };

  const handleCreateShare = async () => {
    if (!selectedSiteId || isSharing) return;
    setIsSharing(true);
    setShareError(null);
    try {
      const res = await fetchJson<{ shareUrl: string }>(`/sites/${selectedSiteId}/report-share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      setNewShareUrl(res.shareUrl);
      void markJourneyMilestone('report_exported').catch(() => {});
      await loadShares();
    } catch (err) {
      setShareError(err instanceof Error ? err.message : 'Failed to create share link');
    } finally {
      setIsSharing(false);
    }
  };

  const handleRevokeShare = async (shareId: string) => {
    if (!selectedSiteId) return;
    try {
      await fetchJson(`/sites/${selectedSiteId}/report-shares/${shareId}/revoke`, { method: 'POST' });
      await loadShares();
    } catch (err) {
      setShareError(err instanceof Error ? err.message : 'Failed to revoke link');
    }
  };

  const handleCopyShare = async () => {
    if (!newShareUrl) return;
    try {
      await navigator.clipboard.writeText(newShareUrl);
      setCopiedShare(true);
      setTimeout(() => setCopiedShare(false), 2000);
    } catch {
      /* user can select manually */
    }
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
            {canManageShares && (
              <button
                type="button"
                onClick={handleOpenShare}
                disabled={!report}
                className="inline-flex items-center gap-2 rounded-2xl border border-surface-200 px-4 py-2.5 text-sm font-semibold text-surface-700 transition hover:border-primary-300 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Link2 className="h-4 w-4" />
                Share link
              </button>
            )}
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

      {/* ── Share modal ──────────────────────────────────────────── */}
      {isShareOpen && (
        <div className="dxm-print-hide fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-surface-900/40" onClick={() => setIsShareOpen(false)} />
          <div className="relative w-full max-w-lg rounded-[28px] border border-surface-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Link2 className="h-5 w-5 text-primary-600" />
                <h3 className="text-lg font-semibold text-surface-900">Share this report</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsShareOpen(false)}
                className="rounded-full p-1.5 text-surface-400 transition hover:bg-surface-100 hover:text-surface-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-2 text-sm text-surface-600">
              Create a read-only link for <strong>{selectedSite?.domain}</strong> that your client can
              open without logging in. Links expire after 30 days and can be revoked here any time.
            </p>

            {newShareUrl ? (
              <div className="mt-4 rounded-3xl border border-amber-300 bg-amber-50 p-4">
                <p className="text-sm font-semibold text-amber-900">
                  Copy this link now — it won't be shown again.
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <code className="flex-1 overflow-x-auto rounded-xl bg-white px-3 py-2 font-mono text-xs text-surface-900">
                    {newShareUrl}
                  </code>
                  <button
                    type="button"
                    onClick={() => void handleCopyShare()}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400 bg-white px-3 py-2 text-xs font-semibold text-amber-900 transition hover:bg-amber-100"
                  >
                    {copiedShare ? (
                      <><CheckCircle2 className="h-3.5 w-3.5" /> Copied</>
                    ) : (
                      <><Copy className="h-3.5 w-3.5" /> Copy</>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void handleCreateShare()}
                disabled={isSharing}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:opacity-60"
              >
                {isSharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                {isSharing ? 'Creating…' : 'Create share link'}
              </button>
            )}

            {shareError && (
              <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {shareError}
              </p>
            )}

            {shares.filter((s) => s.active).length > 0 && (
              <div className="mt-5">
                <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-surface-500">
                  Active links
                </h4>
                <ul className="mt-3 space-y-2">
                  {shares.filter((s) => s.active).map((share) => (
                    <li
                      key={share.id}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-surface-200 bg-surface-50 px-4 py-3"
                    >
                      <div className="text-xs text-surface-600">
                        Created {new Date(share.createdAt + 'Z').toLocaleDateString()} · expires{' '}
                        {new Date(share.expiresAt + 'Z').toLocaleDateString()}
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleRevokeShare(share.id)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-surface-200 bg-white px-3 py-1.5 text-xs font-semibold text-surface-600 transition hover:border-red-300 hover:text-red-700"
                      >
                        <X className="h-3.5 w-3.5" />
                        Revoke
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
