import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Copy,
  FileText,
  Printer,
  Sparkles,
} from 'lucide-react';
import { UpgradeGate } from '../components/UpgradeGate';
import { useAuth } from '../context/AuthContext';
import { fetchJson } from '../lib/api';
import { BILLING_FEATURES, workspaceHasFeature } from '../lib/billing';
import { markJourneyMilestone } from '../lib/workspaceSignals';
import type { ClientSiteDetail, PortfolioOverview } from '../types';

const metricToneClasses = {
  positive: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  neutral: 'border-surface-200 bg-surface-50 text-surface-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
} as const;

const buildEvidenceLines = (
  overview: PortfolioOverview,
  siteDetail: ClientSiteDetail | null,
): string[] => {
  if (siteDetail) {
    const lines: string[] = [];

    if (siteDetail.openAlertsList.length > 0) {
      lines.push(
        ...siteDetail.openAlertsList
          .slice(0, 3)
          .map(
            (alert) =>
              `${alert.title} (${alert.severity}) affecting ${alert.affectedSessions} session${alert.affectedSessions === 1 ? '' : 's'}`,
          ),
      );
    }

    const vitalEntries = Object.entries(siteDetail.vitals).slice(0, 3);
    if (vitalEntries.length > 0) {
      lines.push(
        ...vitalEntries.map(
          ([name, value]) => `${name.toUpperCase()} average ${value.value}`,
        ),
      );
    }

    if (siteDetail.funnels.length > 0) {
      lines.push(
        ...siteDetail.funnels
          .slice(0, 2)
          .map((funnel) => `${funnel.name} is configured with ${funnel.stepCount} tracked steps`),
      );
    }

    if (siteDetail.recentSessions.length > 0) {
      lines.push(
        `Recent traffic: ${siteDetail.recentSessions.length} recent session${siteDetail.recentSessions.length === 1 ? '' : 's'} available for review`,
      );
    }

    return lines.slice(0, 5);
  }

  const lines = [
    ...overview.alertHotspots.slice(0, 3).map((alert) => `${alert.siteName}: ${alert.title}`),
    ...overview.recommendedActions.slice(0, 2).map((action) => action.title),
    ...overview.recentActivity
      .slice(0, 2)
      .map((activity) => `${activity.siteName} recent activity from ${activity.device}`),
  ];

  return lines.slice(0, 5);
};

const buildReportText = (
  report: PortfolioOverview['reports'][number],
  overview: PortfolioOverview,
  siteDetail: ClientSiteDetail | null,
) => {
  const evidence = buildEvidenceLines(overview, siteDetail);

  return [
    `${report.title}`,
    `${report.period} • ${report.audience}`,
    '',
    report.headline,
    '',
    report.summary,
    '',
    'Highlights',
    ...report.highlights.map((item) => `- ${item}`),
    '',
    'Metrics',
    ...report.metrics.map((metric) => `- ${metric.label}: ${metric.value}`),
    '',
    'Recommended next steps',
    ...report.recommendedNextSteps.map((item) => `- ${item}`),
    '',
    'Evidence',
    ...(evidence.length > 0 ? evidence.map((item) => `- ${item}`) : ['- More live data is needed before citing evidence confidently']),
  ].join('\n');
};

export const ReportsPage: React.FC = () => {
  const { workspace } = useAuth();
  const [overview, setOverview] = useState<PortfolioOverview | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [selectedSiteDetail, setSelectedSiteDetail] = useState<ClientSiteDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const canUseReports = workspaceHasFeature(workspace?.plan || 'free', BILLING_FEATURES.reports);

  useEffect(() => {
    if (!canUseReports) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    const loadReports = async () => {
      setIsLoading(true);
      try {
        const data = await fetchJson<PortfolioOverview>('/overview');
        if (!isMounted) return;
        setOverview(data);
        setSelectedReportId((current) => current ?? data.reports[0]?.id ?? null);
        setError(null);
      } catch (loadError) {
        if (!isMounted) return;
        setError(loadError instanceof Error ? loadError.message : 'Failed to load reports');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    void loadReports();
    return () => {
      isMounted = false;
    };
  }, [canUseReports]);

  const selectedReport = useMemo(
    () => overview?.reports.find((report) => report.id === selectedReportId) ?? overview?.reports[0] ?? null,
    [overview, selectedReportId],
  );

  useEffect(() => {
    if (!selectedReport?.siteId) {
      setSelectedSiteDetail(null);
      setIsDetailLoading(false);
      return;
    }

    let isMounted = true;
    setIsDetailLoading(true);

    void fetchJson<ClientSiteDetail>(`/sites/${selectedReport.siteId}`)
      .then((detail) => {
        if (!isMounted) return;
        setSelectedSiteDetail(detail);
      })
      .catch(() => {
        if (!isMounted) return;
        setSelectedSiteDetail(null);
      })
      .finally(() => {
        if (isMounted) {
          setIsDetailLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedReport?.siteId]);

  const handleCopy = async () => {
    if (!overview || !selectedReport) return;
    await navigator.clipboard.writeText(buildReportText(selectedReport, overview, selectedSiteDetail));
    setCopiedId(selectedReport.id);
    void markJourneyMilestone('report_exported').catch(() => {});
    window.setTimeout(() => setCopiedId(null), 1500);
  };

  const handlePrint = () => {
    void markJourneyMilestone('report_exported').catch(() => {});
    window.print();
  };

  const evidenceLines = useMemo(
    () => (overview && selectedReport ? buildEvidenceLines(overview, selectedSiteDetail) : []),
    [overview, selectedReport, selectedSiteDetail],
  );

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

  return (
    <div className="dxm-report-page mx-auto max-w-7xl p-6 md:p-8">
      <div className="dxm-print-hide rounded-[32px] border border-primary-200 bg-white p-6 shadow-sm md:p-8">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-700">Reports</p>
          <h1 className="mt-3 text-3xl font-bold text-surface-900">Client-proof reporting built from live DXM data.</h1>
          <p className="mt-3 text-sm leading-6 text-surface-600">
            Pick the report that matches the conversation, then copy it or print it to PDF without rebuilding the story from scratch.
          </p>
        </div>
      </div>

      {error && (
        <div className="mt-6 rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="mt-6 rounded-[28px] border border-surface-200 bg-white p-12 text-center shadow-sm">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
          <p className="mt-4 text-sm text-surface-500">Preparing report cards…</p>
        </div>
      ) : !overview || overview.reports.length === 0 || !selectedReport ? (
        <div className="mt-6 rounded-[28px] border border-dashed border-surface-200 bg-white p-12 text-center shadow-sm">
          <AlertTriangle className="mx-auto h-10 w-10 text-surface-300" />
          <h2 className="mt-4 text-xl font-semibold text-surface-900">No report signals yet.</h2>
          <p className="mt-2 text-sm text-surface-500">
            Connect one live client site and let DXM collect traffic before expecting a report that feels client-ready.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-6 xl:grid-cols-[0.88fr_1.12fr]">
          <aside className="dxm-print-hide space-y-4">
            {overview.reports.map((report) => {
              const isSelected = report.id === selectedReport.id;
              return (
                <button
                  key={report.id}
                  type="button"
                  onClick={() => setSelectedReportId(report.id)}
                  className={`w-full rounded-[28px] border p-5 text-left shadow-sm transition ${
                    isSelected
                      ? 'border-primary-300 bg-white ring-2 ring-primary-300'
                      : 'border-surface-200 bg-white hover:border-primary-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="inline-flex items-center gap-2 rounded-full bg-primary-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary-700">
                        <FileText className="h-3.5 w-3.5" />
                        {report.audience}
                      </div>
                      <h2 className="mt-4 text-xl font-semibold text-surface-900">{report.title}</h2>
                      <p className="mt-2 text-sm text-surface-500">{report.period}</p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                        report.signalStatus === 'ready'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {report.signalStatus === 'ready' ? 'Ready' : 'Warming up'}
                    </span>
                  </div>

                  <p className="mt-4 text-sm leading-6 text-surface-600">{report.summary}</p>

                  <div className="mt-4 space-y-2">
                    {report.highlights.slice(0, 2).map((highlight) => (
                      <div key={highlight} className="rounded-2xl bg-surface-50 px-4 py-3 text-sm text-surface-700">
                        {highlight}
                      </div>
                    ))}
                  </div>
                </button>
              );
            })}
          </aside>

          <article className="dxm-report-panel rounded-[32px] border border-surface-200 bg-white p-6 shadow-sm md:p-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="max-w-3xl">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="inline-flex items-center gap-2 rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary-700">
                    <Sparkles className="h-3.5 w-3.5" />
                    {selectedReport.audience}
                  </div>
                  <div
                    className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${
                      selectedReport.signalStatus === 'ready'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {selectedReport.signalStatus === 'ready' ? 'Ready to share' : 'Signal warming up'}
                  </div>
                </div>

                <h2 className="mt-4 text-3xl font-bold text-surface-900">{selectedReport.title}</h2>
                <p className="mt-2 text-sm font-medium text-surface-500">{selectedReport.period}</p>
                <p className="mt-4 text-lg font-semibold text-surface-900">{selectedReport.headline}</p>
                <p className="mt-3 text-sm leading-7 text-surface-600">{selectedReport.summary}</p>
              </div>

              <div className="dxm-print-hide flex flex-wrap gap-3">
                <button
                  onClick={() => void handleCopy()}
                  className="inline-flex items-center gap-2 rounded-2xl border border-surface-200 px-4 py-3 text-sm font-semibold text-surface-700 transition hover:border-primary-300 hover:text-primary-700"
                >
                  <Copy className="h-4 w-4" />
                  {copiedId === selectedReport.id ? 'Copied' : 'Copy brief'}
                </button>
                <button
                  onClick={handlePrint}
                  className="inline-flex items-center gap-2 rounded-2xl bg-primary-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary-700"
                >
                  <Printer className="h-4 w-4" />
                  Print / Save PDF
                </button>
              </div>
            </div>

            {selectedReport.signalStatus === 'warming_up' && (
              <div className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
                This report is still credible, but it should be framed as an early read rather than a definitive client story until more live sessions arrive.
              </div>
            )}

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {selectedReport.metrics.map((metric) => (
                <div key={metric.label} className={`rounded-3xl border p-4 ${metricToneClasses[metric.tone]}`}>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em]">{metric.label}</p>
                  <p className="mt-3 text-2xl font-bold">{metric.value}</p>
                </div>
              ))}
            </div>

            <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_1fr]">
              <section className="rounded-[28px] border border-surface-200 bg-surface-50 p-5">
                <h3 className="text-lg font-semibold text-surface-900">What happened</h3>
                <div className="mt-4 space-y-3">
                  {selectedReport.highlights.map((highlight) => (
                    <div key={highlight} className="rounded-2xl border border-white/80 bg-white px-4 py-3 text-sm text-surface-700">
                      {highlight}
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-[28px] border border-surface-200 bg-surface-50 p-5">
                <h3 className="text-lg font-semibold text-surface-900">Recommended next steps</h3>
                <div className="mt-4 space-y-3">
                  {selectedReport.recommendedNextSteps.map((step) => (
                    <div key={step} className="rounded-2xl border border-white/80 bg-white px-4 py-3 text-sm text-surface-700">
                      {step}
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <section className="mt-8 rounded-[28px] border border-surface-200 bg-white p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-surface-900">Evidence to cite</h3>
                  <p className="mt-1 text-sm text-surface-500">
                    Use these proof points when a client asks why this report matters.
                  </p>
                </div>
                {isDetailLoading && (
                  <span className="text-xs font-medium uppercase tracking-[0.18em] text-surface-400">
                    Loading site evidence…
                  </span>
                )}
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {evidenceLines.length > 0 ? (
                  evidenceLines.map((line) => (
                    <div key={line} className="rounded-2xl bg-surface-50 px-4 py-3 text-sm text-surface-700">
                      {line}
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-surface-200 px-4 py-6 text-sm text-surface-500">
                    More live evidence will appear here as DXM collects alerts, sessions, vitals, and funnel data.
                  </div>
                )}
              </div>

              {selectedSiteDetail && (
                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl border border-surface-200 bg-surface-50 px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-surface-500">Open alerts</p>
                    <p className="mt-2 text-lg font-semibold text-surface-900">{selectedSiteDetail.openAlertsList.length}</p>
                  </div>
                  <div className="rounded-2xl border border-surface-200 bg-surface-50 px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-surface-500">Recent sessions</p>
                    <p className="mt-2 text-lg font-semibold text-surface-900">{selectedSiteDetail.recentSessions.length}</p>
                  </div>
                  <div className="rounded-2xl border border-surface-200 bg-surface-50 px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-surface-500">Tracked funnels</p>
                    <p className="mt-2 text-lg font-semibold text-surface-900">{selectedSiteDetail.funnels.length}</p>
                  </div>
                </div>
              )}
            </section>

            <div className="dxm-print-hide mt-8 rounded-[28px] border border-primary-200 bg-primary-50 p-5 text-sm text-primary-900">
              Browser print is the intended export path for this milestone. Use “Save as PDF” from the print dialog for a client-ready handoff without building server-side document infrastructure yet.
            </div>
          </article>
        </div>
      )}
    </div>
  );
};
