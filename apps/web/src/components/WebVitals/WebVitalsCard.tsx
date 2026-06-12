/**
 * Core Web Vitals surface.
 *
 * Renders five metric gauges (LCP / INP / CLS / FCP / TTFB) with Google-threshold
 * colouring. Mounted on the Dashboard (portfolio-level, siteId=null) and on
 * Client Detail (site-scoped). Device toggle reads the `sessions.device` tag
 * that the SDK records with every session.
 *
 * Backed by `GET /sites/vitals` and `GET /sites/:id/vitals`.
 */
import React, { useEffect, useState } from 'react';
import { Activity, Monitor, Smartphone, Tablet, Globe2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  WebVitalName,
  WebVitalsDevice,
  WebVitalsRange,
  WebVitalsResponse,
} from '../../../../../packages/contracts/index';
import { fetchJson } from '../../lib/api';
import { VitalGauge } from './VitalGauge';

interface Props {
  /** Site ID to scope to. Omit or pass null for the portfolio-level view. */
  siteId?: string | null;
}

const RANGES: { id: WebVitalsRange; label: string }[] = [
  { id: '24h', label: '24h' },
  { id: '7d', label: '7d' },
  { id: '30d', label: '30d' },
];

const DEVICES: { id: WebVitalsDevice; labelKey: string; Icon: React.FC<{ className?: string }> }[] = [
  { id: 'all', labelKey: 'vitals.device.all', Icon: Globe2 },
  { id: 'desktop', labelKey: 'vitals.device.desktop', Icon: Monitor },
  { id: 'mobile', labelKey: 'vitals.device.mobile', Icon: Smartphone },
  { id: 'tablet', labelKey: 'vitals.device.tablet', Icon: Tablet },
];

const METRIC_ORDER: WebVitalName[] = ['LCP', 'INP', 'CLS', 'FCP', 'TTFB'];

export const WebVitalsCard: React.FC<Props> = ({ siteId = null }) => {
  const { t } = useTranslation();
  const [range, setRange] = useState<WebVitalsRange>('7d');
  const [device, setDevice] = useState<WebVitalsDevice>('all');
  const [data, setData] = useState<WebVitalsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    setError(null);
    const qs = new URLSearchParams({ range, device });
    const path = siteId ? `/sites/${siteId}/vitals?${qs}` : `/sites/vitals?${qs}`;
    fetchJson<WebVitalsResponse>(path)
      .then((resp) => {
        if (!mounted) return;
        setData(resp);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : t('vitals.loadError'));
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [siteId, range, device, t]);

  const metrics = data?.metrics ?? [];
  const metricsByName = new Map(metrics.map((m) => [m.name, m]));

  const anyData = metrics.some((m) => m.sampleSize > 0);
  const poorCount = metrics.filter((m) => m.status === 'poor').length;
  const warnCount = metrics.filter((m) => m.status === 'needs-improvement').length;

  return (
    <div className="rounded-2xl border border-surface-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-100">
              <Activity className="h-4 w-4 text-primary-700" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-surface-900">{t('vitals.title')}</h3>
              <p className="text-[11px] text-surface-500">
                {siteId ? t('vitals.subtitleSite') : t('vitals.subtitlePortfolio')} · {t('vitals.thresholdNote')}
              </p>
            </div>
          </div>
          {anyData && (poorCount > 0 || warnCount > 0) && (
            <p className="mt-2 text-xs text-surface-600">
              {poorCount > 0 && (
                <span className="mr-2 inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 font-semibold text-rose-700 ring-1 ring-rose-200">
                  {t('vitals.poorCount', { count: poorCount })}
                </span>
              )}
              {warnCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700 ring-1 ring-amber-200">
                  {t('vitals.needsWorkCount', { count: warnCount })}
                </span>
              )}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-surface-200 bg-surface-50 p-0.5">
            {RANGES.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setRange(id)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  range === id
                    ? 'bg-white text-primary-700 shadow-sm'
                    : 'text-surface-500 hover:text-surface-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex rounded-xl border border-surface-200 bg-surface-50 p-0.5">
            {DEVICES.map(({ id, labelKey, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setDevice(id)}
                title={t(labelKey)}
                aria-label={t(labelKey)}
                className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold transition ${
                  device === id
                    ? 'bg-white text-primary-700 shadow-sm'
                    : 'text-surface-500 hover:text-surface-800'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t(labelKey)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {METRIC_ORDER.map((name) => (
            <div
              key={name}
              className="h-32 animate-pulse rounded-2xl border border-surface-200 bg-surface-50"
            />
          ))}
        </div>
      ) : error ? (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : !anyData ? (
        <div className="mt-4 rounded-2xl border border-dashed border-surface-200 bg-surface-50 px-4 py-8 text-center">
          <p className="text-sm font-semibold text-surface-700">
            {t('vitals.emptyTitle')}
          </p>
          <p className="mt-1 text-xs text-surface-500">
            {siteId ? t('vitals.emptyDescSite') : t('vitals.emptyDescPortfolio')}
          </p>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {METRIC_ORDER.map((name) => {
            const metric =
              metricsByName.get(name) ??
              ({
                name,
                sampleSize: 0,
                p50: null,
                p75: null,
                p95: null,
                status: 'insufficient-data' as const,
              });
            return <VitalGauge key={name} metric={metric} />;
          })}
        </div>
      )}

      {data && (
        <p className="mt-3 text-[10px] text-surface-400">
          {t('vitals.sessionsInWindow', { count: data.totalSessions })} · {t('vitals.lowerIsBetter')}
        </p>
      )}
    </div>
  );
};
