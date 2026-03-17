import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Search, Loader2, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { fetchJson } from '../../lib/api';

interface AuditResult {
  url: string;
  ttfbMs: number;
  mobileReady: boolean;
  pageSizeKb: number;
  score: 'good' | 'needs-work' | 'poor';
}

const speedLabel = (ms: number) => {
  if (ms < 1000) return 'Fast';
  if (ms < 3000) return 'OK';
  return 'Slow';
};

const speedColor = (ms: number) => {
  if (ms < 1000) return 'text-green-600 bg-green-50';
  if (ms < 3000) return 'text-amber-600 bg-amber-50';
  return 'text-red-600 bg-red-50';
};

const sizeLabel = (kb: number) => {
  if (kb < 500) return 'Small';
  if (kb < 2000) return 'Medium';
  return 'Large';
};

const sizeColor = (kb: number) => {
  if (kb < 500) return 'text-green-600 bg-green-50';
  if (kb < 2000) return 'text-amber-600 bg-amber-50';
  return 'text-red-600 bg-red-50';
};

const ScoreIcon: React.FC<{ score: AuditResult['score'] }> = ({ score }) => {
  if (score === 'good') return <CheckCircle2 className="h-6 w-6 text-green-600" />;
  if (score === 'needs-work') return <AlertTriangle className="h-6 w-6 text-amber-600" />;
  return <XCircle className="h-6 w-6 text-red-600" />;
};

const scoreColor = (score: AuditResult['score']) => {
  if (score === 'good') return 'text-green-700 bg-green-50 border-green-200';
  if (score === 'needs-work') return 'text-amber-700 bg-amber-50 border-amber-200';
  return 'text-red-700 bg-red-50 border-red-200';
};

export const SiteAudit: React.FC = () => {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const data = await fetchJson<AuditResult>(`/audit?url=${encodeURIComponent(url.trim())}`);
      setResult(data);
    } catch (err) {
      setError(t('audit.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-surface-200 bg-white p-6 shadow-xl sm:p-8">
      <h3 className="text-center text-lg font-bold text-surface-900">
        {t('audit.title')}
      </h3>
      <p className="mt-1 text-center text-sm text-surface-500">
        {t('audit.subtitle')}
      </p>

      <form onSubmit={handleSubmit} className="mt-5 flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={t('audit.placeholder')}
            className="w-full rounded-xl border border-surface-300 py-3 pl-10 pr-4 text-sm transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !url.trim()}
          className="shrink-0 rounded-xl bg-accent-600 px-6 py-3 text-sm font-bold text-white shadow transition hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('audit.analyzing')}
            </span>
          ) : (
            t('audit.submit')
          )}
        </button>
      </form>

      {error && (
        <div className="mt-4 rounded-xl bg-red-50 p-4 text-center text-sm text-red-700">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-6 space-y-4">
          {/* Overall Score */}
          <div className={`flex items-center justify-between rounded-xl border p-4 ${scoreColor(result.score)}`}>
            <div className="flex items-center gap-3">
              <ScoreIcon score={result.score} />
              <span className="font-semibold">{t('audit.overallScore')}</span>
            </div>
            <span className="font-bold capitalize">
              {t(`audit.score_${result.score}`)}
            </span>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {/* Response Time */}
            <div className="rounded-xl border border-surface-200 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-surface-500">
                {t('audit.responseTime')}
              </p>
              <p className="mt-1 text-lg font-bold text-surface-900">
                {(result.ttfbMs / 1000).toFixed(2)}s
              </p>
              <span className={`mt-1 inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${speedColor(result.ttfbMs)}`}>
                {speedLabel(result.ttfbMs)}
              </span>
            </div>

            {/* Mobile Ready */}
            <div className="rounded-xl border border-surface-200 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-surface-500">
                {t('audit.mobileReady')}
              </p>
              <p className="mt-1 text-lg font-bold text-surface-900">
                {result.mobileReady ? t('audit.yes') : t('audit.no')}
              </p>
              <span
                className={`mt-1 inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${
                  result.mobileReady ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
                }`}
              >
                {result.mobileReady ? t('audit.yes') : t('audit.no')}
              </span>
            </div>

            {/* Page Size */}
            <div className="rounded-xl border border-surface-200 p-4 col-span-2 sm:col-span-1">
              <p className="text-xs font-medium uppercase tracking-wide text-surface-500">
                {t('audit.pageSize')}
              </p>
              <p className="mt-1 text-lg font-bold text-surface-900">
                {result.pageSizeKb.toFixed(0)} KB
              </p>
              <span className={`mt-1 inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${sizeColor(result.pageSizeKb)}`}>
                {sizeLabel(result.pageSizeKb)}
              </span>
            </div>
          </div>

          {/* CTA */}
          <div className="rounded-xl bg-primary-50 p-4 text-center">
            <p className="text-sm text-primary-800">
              {t('audit.ctaText')}{' '}
              <Link to="/signup" className="font-bold text-primary-600 underline hover:text-primary-700">
                {t('audit.ctaLink')}
              </Link>
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default SiteAudit;
