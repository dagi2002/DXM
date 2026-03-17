import React, { createContext, useContext, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Zap, X, BarChart2, Activity, AlertTriangle, Users, TrendingUp, MousePointer, Clock, Percent } from 'lucide-react';
import {
  demoMetrics,
  demoSessions,
  demoFunnel,
  demoAlerts,
  demoVitals,
  demoClickPoints,
} from '../data/demoData';

// ─── Demo Context ──────────────────────────────────────────────────────────────

interface DemoContextValue {
  isDemo: true;
}

export const DemoContext = createContext<DemoContextValue>({ isDemo: true });
export const useDemo = () => useContext(DemoContext);

// ─── Helper components ─────────────────────────────────────────────────────────

const MetricCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color?: string;
}> = ({ icon, label, value, sub, color = 'text-blue-600 bg-blue-50' }) => (
  <div className="bg-white rounded-xl border border-gray-100 p-5">
    <div className="flex items-center justify-between mb-3">
      <span className="text-sm text-gray-500">{label}</span>
      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${color}`}>
        {icon}
      </div>
    </div>
    <div className="text-2xl font-bold text-gray-900">{value}</div>
    {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
  </div>
);

const SeverityBadge: React.FC<{ severity: string }> = ({ severity }) => {
  const map: Record<string, string> = {
    critical: 'bg-red-100 text-red-700',
    high: 'bg-orange-100 text-orange-700',
    medium: 'bg-yellow-100 text-yellow-700',
    low: 'bg-green-100 text-green-700',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${map[severity] || 'bg-gray-100 text-gray-600'}`}>
      {severity}
    </span>
  );
};

// ─── Tab views ─────────────────────────────────────────────────────────────────

const OverviewTab: React.FC = () => {
  const fmt = (s: number) => `${Math.floor(s / 60)}m ${s % 60}s`;

  return (
    <div className="space-y-6">
      {/* Metrics grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          icon={<Activity className="h-4 w-4" />}
          label="Active Sessions"
          value={demoMetrics.activeSessions.toLocaleString()}
          sub="Right now"
          color="text-blue-600 bg-blue-50"
        />
        <MetricCard
          icon={<Clock className="h-4 w-4" />}
          label="Avg Session"
          value={fmt(demoMetrics.avgSessionDuration)}
          sub="Last 7 days"
          color="text-purple-600 bg-purple-50"
        />
        <MetricCard
          icon={<Percent className="h-4 w-4" />}
          label="Bounce Rate"
          value={`${demoMetrics.bounceRate}%`}
          sub="↓ 3% vs last week"
          color="text-orange-600 bg-orange-50"
        />
        <MetricCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Conversion"
          value={`${demoMetrics.conversionRate}%`}
          sub="↑ 0.4% vs last week"
          color="text-green-600 bg-green-50"
        />
      </div>

      {/* Live sessions */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          Live Sessions
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 border-b border-gray-100">
                <th className="text-left pb-2 font-medium">Page</th>
                <th className="text-left pb-2 font-medium">Device</th>
                <th className="text-right pb-2 font-medium">Duration</th>
                <th className="text-right pb-2 font-medium">Clicks</th>
                <th className="text-right pb-2 font-medium">Scroll</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {demoSessions.slice(0, 5).map(s => (
                <tr key={s.id} className="hover:bg-gray-50/50">
                  <td className="py-2.5 pr-4 text-gray-700 max-w-[160px] truncate">
                    {s.entryUrl}
                  </td>
                  <td className="py-2.5 pr-4">
                    <span className="capitalize text-gray-500">{s.device}</span>
                  </td>
                  <td className="py-2.5 pr-4 text-right text-gray-600">{fmt(s.duration)}</td>
                  <td className="py-2.5 pr-4 text-right text-gray-600">{s.clicks}</td>
                  <td className="py-2.5 text-right">
                    <span className={`${s.scrollDepth > 70 ? 'text-green-600' : 'text-gray-500'}`}>
                      {s.scrollDepth}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const FunnelTab: React.FC = () => {
  const maxUsers = demoFunnel[0].users;

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6">
      <h3 className="font-semibold text-gray-900 mb-6">Purchase Funnel — Habesha Mart</h3>
      <div className="space-y-4">
        {demoFunnel.map((step, i) => {
          const pct = (step.users / maxUsers) * 100;
          const isBottleneck = step.dropoffRate > 35;
          return (
            <div key={step.name}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-gray-800">{step.name}</span>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-gray-600 font-medium">{step.users.toLocaleString()} users</span>
                  {step.dropoffRate > 0 && (
                    <span className={`font-medium ${isBottleneck ? 'text-red-600' : 'text-orange-500'}`}>
                      −{step.dropoffRate.toFixed(0)}%
                    </span>
                  )}
                </div>
              </div>
              <div className="h-8 bg-gray-100 rounded-lg overflow-hidden">
                <div
                  className={`h-full rounded-lg transition-all ${
                    isBottleneck ? 'bg-red-500' : i === 0 ? 'bg-blue-500' : i === demoFunnel.length - 1 ? 'bg-green-500' : 'bg-blue-400'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              {isBottleneck && step.exitReasons.length > 0 && (
                <div className="mt-2 ml-1 text-xs text-red-600 font-medium">
                  ⚠ Main drop-off: {step.exitReasons[0].reason} ({step.exitReasons[0].pct}%)
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-gray-400 mt-6">
        🇪🇹 Key insight: 51% of users drop off at checkout — primarily due to missing Telebirr/CBEBirr payment options.
      </p>
    </div>
  );
};

const HeatmapTab: React.FC = () => {
  const maxCount = Math.max(...demoClickPoints.map(p => p.count));

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6">
      <h3 className="font-semibold text-gray-900 mb-2">Click Heatmap — Product Page</h3>
      <p className="text-sm text-gray-500 mb-4">
        {demoClickPoints.reduce((a, p) => a + p.count, 0).toLocaleString()} total clicks recorded
      </p>
      <div
        className="relative bg-gray-900 rounded-xl overflow-hidden"
        style={{ paddingTop: '177.7%' }} // 9:16 mobile viewport ratio
      >
        {/* Phone-like UI skeleton */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-0 left-0 right-0 h-[5%] bg-gray-600" /> {/* header */}
          <div className="absolute top-[5%] left-0 right-0 h-[30%] bg-gray-700" /> {/* product image */}
          <div className="absolute top-[37%] left-[5%] right-[5%] h-[5%] bg-gray-600 rounded" /> {/* title */}
          <div className="absolute top-[43%] left-[5%] w-[25%] h-[4%] bg-gray-600 rounded" /> {/* price */}
          <div className="absolute top-[50%] left-[5%] right-[5%] h-[4%] bg-gray-600 rounded flex gap-2" /> {/* variants */}
          <div className="absolute top-[59%] left-[5%] right-[5%] h-[6%] bg-blue-800 rounded" /> {/* add to cart */}
          <div className="absolute top-[67%] left-[5%] right-[5%] h-[5%] bg-gray-600 rounded" /> {/* buy now */}
        </div>

        {/* Heatmap dots */}
        {demoClickPoints.map((point, i) => {
          const intensity = point.count / maxCount;
          const radius = 4 + intensity * 20;
          const alpha = 0.3 + intensity * 0.6;
          const color =
            intensity > 0.7
              ? `rgba(239,68,68,${alpha})`
              : intensity > 0.4
              ? `rgba(249,115,22,${alpha})`
              : `rgba(234,179,8,${alpha})`;
          return (
            <div
              key={i}
              className="absolute rounded-full pointer-events-none"
              style={{
                left: `${point.x}%`,
                top: `${point.y}%`,
                width: `${radius * 2}px`,
                height: `${radius * 2}px`,
                backgroundColor: color,
                transform: 'translate(-50%, -50%)',
                filter: `blur(${radius * 0.4}px)`,
              }}
            />
          );
        })}

        {/* Legend */}
        <div className="absolute bottom-2 left-2 flex items-center gap-1 text-[10px] text-white/70">
          <div className="w-3 h-3 rounded-full bg-yellow-400/70" />
          <span>Low</span>
          <div className="w-3 h-3 rounded-full bg-orange-500/70 ml-1" />
          <span>Mid</span>
          <div className="w-3 h-3 rounded-full bg-red-500/70 ml-1" />
          <span>High</span>
        </div>
      </div>
    </div>
  );
};

const AlertsTab: React.FC = () => {
  const severityIcon: Record<string, string> = {
    critical: '🔴',
    high: '🟠',
    medium: '🟡',
    low: '🟢',
  };

  return (
    <div className="space-y-3">
      {demoAlerts.map(alert => (
        <div
          key={alert.id}
          className={`bg-white rounded-xl border p-5 ${
            alert.resolved ? 'border-gray-100 opacity-60' : 'border-gray-200'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="text-lg leading-none mt-0.5">{severityIcon[alert.severity]}</span>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-900 text-sm">{alert.title}</span>
                  <SeverityBadge severity={alert.severity} />
                  {alert.resolved && (
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                      Resolved
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 mt-1">{alert.description}</p>
                <p className="text-xs text-gray-400 mt-1.5">
                  {alert.affectedSessions.toLocaleString()} sessions affected
                </p>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

const VitalsTab: React.FC = () => {
  const statusColors: Record<string, string> = {
    good: 'text-green-600 bg-green-50 border-green-200',
    warning: 'text-yellow-600 bg-yellow-50 border-yellow-200',
    poor: 'text-red-600 bg-red-50 border-red-200',
  };

  const thresholds: Record<string, { good: number; warning: number }> = {
    LCP: { good: 2500, warning: 4000 },
    FCP: { good: 1800, warning: 3000 },
    TTFB: { good: 800, warning: 1800 },
    CLS: { good: 0.1, warning: 0.25 },
    INP: { good: 200, warning: 500 },
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
      {demoVitals.map(v => {
        const t = thresholds[v.name];
        const isLower = v.name !== 'CLS';
        const fmt = (val: number) =>
          v.name === 'CLS' ? val.toFixed(2) : `${val.toLocaleString()}${v.unit}`;

        return (
          <div
            key={v.name}
            className={`rounded-xl border p-5 ${statusColors[v.status]}`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-lg font-bold">{v.name}</span>
              <span className={`text-xs font-medium px-2 py-1 rounded-full border ${statusColors[v.status]} capitalize`}>
                {v.status}
              </span>
            </div>
            <div className="text-3xl font-bold mb-1">{fmt(v.p50)}</div>
            <div className="text-xs opacity-70 mb-3">p50 (median)</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <div className="opacity-60">p75</div>
                <div className="font-semibold">{fmt(v.p75)}</div>
              </div>
              <div>
                <div className="opacity-60">p95</div>
                <div className="font-semibold">{fmt(v.p95)}</div>
              </div>
            </div>
            <div className="text-xs opacity-60 mt-3">
              Good: {isLower ? '<' : '>'}{fmt(t.good)} · Poor: {isLower ? '>' : '<'}{fmt(t.warning)}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─── Main DemoPage ─────────────────────────────────────────────────────────────

type TabId = 'overview' | 'funnel' | 'heatmap' | 'alerts' | 'vitals';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <BarChart2 className="h-4 w-4" /> },
  { id: 'funnel', label: 'Funnel', icon: <TrendingUp className="h-4 w-4" /> },
  { id: 'heatmap', label: 'Heatmap', icon: <MousePointer className="h-4 w-4" /> },
  { id: 'alerts', label: 'Alerts', icon: <AlertTriangle className="h-4 w-4" /> },
  { id: 'vitals', label: 'Vitals', icon: <Activity className="h-4 w-4" /> },
];

export const DemoPage: React.FC = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [bannerVisible, setBannerVisible] = useState(true);

  return (
    <DemoContext.Provider value={{ isDemo: true }}>
      <div className="min-h-screen bg-gray-50">
        {/* Demo banner */}
        {bannerVisible && (
          <div className="bg-blue-600 text-white px-4 py-2.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <Zap className="h-4 w-4 shrink-0" />
              <span>
                <strong>Demo mode</strong> — showing sample data for "Habesha Mart" Ethiopian e-commerce.
                No account required.
              </span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <Link
                to="/signup"
                className="hidden sm:inline-flex items-center gap-1.5 bg-white text-blue-600 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
              >
                Start Free Trial →
              </Link>
              <button
                onClick={() => setBannerVisible(false)}
                className="text-white/70 hover:text-white transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 md:px-8 py-4">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-6 w-6 text-blue-600" />
              <span className="text-lg font-bold text-gray-900">DXM Pulse</span>
              <span className="ml-2 text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Demo</span>
            </div>
            <div className="flex items-center gap-3">
              <Link
                to="/login"
                className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                {t('auth.login')}
              </Link>
              <Link
                to="/signup"
                className="text-sm font-semibold bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                {t('auth.signup')}
              </Link>
            </div>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 md:px-8 py-6">
          {/* Site header */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl font-bold text-gray-900">Habesha Mart</h1>
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">habeshamart.et</span>
            </div>
            <p className="text-sm text-gray-500">Last 7 days · {demoMetrics.totalPageviews.toLocaleString()} pageviews</p>
          </div>

          {/* Tab bar */}
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 overflow-x-auto">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab === 'overview' && <OverviewTab />}
          {activeTab === 'funnel' && <FunnelTab />}
          {activeTab === 'heatmap' && <HeatmapTab />}
          {activeTab === 'alerts' && <AlertsTab />}
          {activeTab === 'vitals' && <VitalsTab />}

          {/* CTA footer */}
          <div className="mt-10 bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-8 text-center text-white">
            <Zap className="h-10 w-10 mx-auto mb-3 opacity-90" />
            <h2 className="text-2xl font-bold mb-2">Ready to track your own site?</h2>
            <p className="text-blue-100 mb-6 text-sm max-w-md mx-auto">
              Add one line of code and get real session recording, heatmaps, funnel analysis,
              and Telegram alerts — designed for Ethiopian businesses.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                to="/signup"
                className="inline-flex items-center justify-center gap-2 bg-white text-blue-600 font-semibold px-6 py-3 rounded-xl hover:bg-blue-50 transition-colors"
              >
                Start Free Trial
              </Link>
              <a
                href="https://t.me/dxmpulse"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 border-2 border-white/40 text-white font-semibold px-6 py-3 rounded-xl hover:bg-white/10 transition-colors"
              >
                Contact on Telegram
              </a>
            </div>
            <p className="text-blue-200 text-xs mt-4">Free plan available · No credit card required</p>
          </div>
        </div>
      </div>
    </DemoContext.Provider>
  );
};
