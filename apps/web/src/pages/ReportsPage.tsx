import React, { useEffect, useState } from 'react';
import { Copy, FileText } from 'lucide-react';
import { fetchJson } from '../lib/api';
import type { PortfolioOverview } from '../types';

const buildReportText = (report: PortfolioOverview['reports'][number]) =>
  `${report.title}\n${report.period}\nAudience: ${report.audience}\n\n${report.summary}\n\nHighlights:\n${report.highlights.map((item) => `- ${item}`).join('\n')}`;

export const ReportsPage: React.FC = () => {
  const [overview, setOverview] = useState<PortfolioOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadReports = async () => {
      setIsLoading(true);
      try {
        const data = await fetchJson<PortfolioOverview>('/overview');
        if (!isMounted) return;
        setOverview(data);
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
  }, []);

  const handleCopy = async (report: PortfolioOverview['reports'][number]) => {
    await navigator.clipboard.writeText(buildReportText(report));
    setCopiedId(report.id);
    window.setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div className="mx-auto max-w-7xl p-6 md:p-8">
      <div className="rounded-[32px] border border-primary-200 bg-white p-6 shadow-sm md:p-8">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-700">Reports</p>
          <h1 className="mt-3 text-3xl font-bold text-surface-900">Share-ready updates for client check-ins and internal ops.</h1>
          <p className="mt-3 text-sm leading-6 text-surface-600">
            These summaries are generated from live portfolio data so your team can move from analytics to communication without inventing a story after the fact.
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
      ) : (
        <div className="mt-6 grid gap-5 xl:grid-cols-3">
          {(overview?.reports || []).map((report) => (
            <article key={report.id} className="rounded-[28px] border border-surface-200 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary-700">
                    <FileText className="h-3.5 w-3.5" />
                    {report.audience}
                  </div>
                  <h2 className="mt-4 text-2xl font-semibold text-surface-900">{report.title}</h2>
                  <p className="mt-2 text-sm text-surface-500">{report.period}</p>
                </div>
                <button
                  onClick={() => void handleCopy(report)}
                  className="inline-flex items-center gap-2 rounded-2xl border border-surface-200 px-4 py-3 text-sm font-semibold text-surface-700 transition hover:border-primary-300 hover:text-primary-700"
                >
                  <Copy className="h-4 w-4" />
                  {copiedId === report.id ? 'Copied' : 'Copy'}
                </button>
              </div>

              <p className="mt-5 text-sm leading-6 text-surface-700">{report.summary}</p>

              <div className="mt-5 space-y-3">
                {report.highlights.map((highlight) => (
                  <div key={highlight} className="rounded-2xl bg-surface-50 px-4 py-3 text-sm text-surface-700">
                    {highlight}
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};
