import React, { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, Gauge, TimerReset } from 'lucide-react';
import { fetchJson } from '../../../lib/api';

type VitalStatus = 'good' | 'needs-improvement' | 'poor';

interface VitalValue {
  value: number;
  p50: number;
  p75: number;
  p95: number;
}

interface VitalsApiResponse {
  lcp?: VitalValue;
  fcp?: VitalValue;
  cls?: VitalValue;
  ttfb?: VitalValue;
  inp?: VitalValue;
  fid?: VitalValue;
}

interface VitalDefinition {
  key: keyof VitalsApiResponse;
  label: string;
  description: string;
  benchmark: string;
}

interface VitalCardData extends VitalDefinition {
  metric: VitalValue;
  status: VitalStatus;
  displayValue: string;
  displayP75: string;
  displayP95: string;
}

const VITAL_DEFINITIONS: VitalDefinition[] = [
  { key: 'fcp', label: 'First Contentful Paint', description: 'Time until the first text or image is painted.', benchmark: '< 1.8s' },
  { key: 'lcp', label: 'Largest Contentful Paint', description: 'How quickly the main content becomes visible.', benchmark: '< 2.5s' },
  { key: 'cls', label: 'Cumulative Layout Shift', description: 'Visual stability during loading.', benchmark: '< 0.1' },
  { key: 'fid', label: 'First Input Delay', description: 'Delay before the page responds to the first input.', benchmark: '< 100ms' },
  { key: 'inp', label: 'Interaction to Next Paint', description: 'Responsiveness during user interactions.', benchmark: '< 200ms' },
  { key: 'ttfb', label: 'Time to First Byte', description: 'Initial server response time.', benchmark: '< 800ms' },
];

function formatVitalValue(key: keyof VitalsApiResponse, value: number): string {
  if (key === 'cls') {
    return value.toFixed(3);
  }

  return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`;
}

function getVitalStatus(key: keyof VitalsApiResponse, value: number): VitalStatus {
  if (key === 'cls') {
    if (value <= 0.1) {
      return 'good';
    }

    if (value <= 0.25) {
      return 'needs-improvement';
    }

    return 'poor';
  }

  const thresholds: Record<string, [number, number]> = {
    lcp: [2500, 4000],
    fcp: [1800, 3000],
    ttfb: [800, 1800],
    inp: [200, 500],
    fid: [100, 300],
  };
  const [goodThreshold, poorThreshold] = thresholds[key] ?? [1000, 3000];

  if (value <= goodThreshold) {
    return 'good';
  }

  if (value <= poorThreshold) {
    return 'needs-improvement';
  }

  return 'poor';
}

function getStatusClassName(status: VitalStatus): string {
  switch (status) {
    case 'good':
      return 'border-green-200 bg-green-50 text-green-700';
    case 'needs-improvement':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    default:
      return 'border-red-200 bg-red-50 text-red-700';
  }
}

export const PerformanceMetrics: React.FC = () => {
  const [vitals, setVitals] = useState<VitalsApiResponse>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadVitals = async () => {
      setIsLoading(true);

      try {
        const data = await fetchJson<VitalsApiResponse>('/analytics/vitals?period=7d');
        if (!isMounted) {
          return;
        }

        setVitals(data ?? {});
        setError(null);
      } catch {
        if (!isMounted) {
          return;
        }

        setVitals({});
        setError('Live performance data is unavailable right now.');
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadVitals();

    return () => {
      isMounted = false;
    };
  }, []);

  const cards = useMemo<VitalCardData[]>(
    () =>
      VITAL_DEFINITIONS.flatMap((definition) => {
        const metric = vitals[definition.key];
        if (!metric) {
          return [];
        }

        return [{
          ...definition,
          metric,
          status: getVitalStatus(definition.key, metric.value),
          displayValue: formatVitalValue(definition.key, metric.value),
          displayP75: formatVitalValue(definition.key, metric.p75),
          displayP95: formatVitalValue(definition.key, metric.p95),
        }];
      }),
    [vitals]
  );

  const goodCount = cards.filter((card) => card.status === 'good').length;
  const needsAttentionCount = cards.filter((card) => card.status !== 'good').length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Performance</h2>
          <p className="text-gray-600">
            Live Core Web Vitals from the last 7 days. Advanced device, geo, and error breakdowns stay hidden until
            they are backed by collected telemetry.
          </p>
        </div>
        <span className="rounded-full bg-surface-100 px-3 py-1 text-xs font-medium text-surface-600">
          Last 7 days
        </span>
      </div>

      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Gauge className="h-4 w-4 text-primary-600" />
            Tracked metrics
          </div>
          <div className="mt-2 text-3xl font-bold text-gray-900">{cards.length}</div>
          <p className="mt-1 text-sm text-gray-600">Only metrics with live data are shown.</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Activity className="h-4 w-4 text-green-600" />
            Healthy metrics
          </div>
          <div className="mt-2 text-3xl font-bold text-gray-900">{goodCount}</div>
          <p className="mt-1 text-sm text-gray-600">Metrics currently meeting their benchmark.</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <TimerReset className="h-4 w-4 text-amber-600" />
            Needs attention
          </div>
          <div className="mt-2 text-3xl font-bold text-gray-900">{needsAttentionCount}</div>
          <p className="mt-1 text-sm text-gray-600">Metrics outside the healthy range.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500">
          Loading live performance data…
        </div>
      ) : cards.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-gray-300" />
          <h3 className="text-lg font-medium text-gray-900">No live vitals yet</h3>
          <p className="mt-2 text-sm text-gray-600">
            Once the SDK collects performance events, this view will populate with real Core Web Vitals.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {cards.map((card) => (
            <section key={card.key} className="rounded-lg border border-gray-200 bg-white p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{card.label}</h3>
                  <p className="mt-1 text-sm text-gray-600">{card.description}</p>
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs font-medium ${getStatusClassName(card.status)}`}>
                  {card.status.replace('-', ' ')}
                </span>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-gray-50 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Average</p>
                  <p className="mt-2 text-2xl font-bold text-gray-900">{card.displayValue}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">P75</p>
                  <p className="mt-2 text-2xl font-bold text-gray-900">{card.displayP75}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">P95</p>
                  <p className="mt-2 text-2xl font-bold text-gray-900">{card.displayP95}</p>
                </div>
              </div>

              <p className="mt-4 text-sm text-gray-500">Benchmark: {card.benchmark}</p>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};

export default PerformanceMetrics;
