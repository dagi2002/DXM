import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { FunnelAnalysisDetail, FunnelAnalysisStep } from '../../../types';
import {
  AlertTriangle,
  Calendar,
  Clock,
  Plus,
  RefreshCw,
  Sparkles,
  Target,
  TrendingDown,
  Users,
} from 'lucide-react';
import { fetchJson } from '../../../lib/api';
import { FunnelBuilder } from './FunnelBuilder';

const evidenceToneClasses = {
  positive: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  neutral: 'border-surface-200 bg-surface-50 text-surface-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
} as const;

const timeframeOptions = [
  { value: '1d', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
];

interface ApiFunnel {
  id: string;
  name: string;
  steps: { name: string; urlPattern: string }[];
}

export const FunnelAnalysis: React.FC = () => {
  const [selectedTimeframe, setSelectedTimeframe] = useState('7d');
  const [funnels, setFunnels] = useState<ApiFunnel[]>([]);
  const [selectedFunnelId, setSelectedFunnelId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<FunnelAnalysisDetail | null>(null);
  const [loadingFunnels, setLoadingFunnels] = useState(true);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);

  const loadFunnels = useCallback(async () => {
    setLoadingFunnels(true);
    try {
      const list = await fetchJson<ApiFunnel[]>('/funnels');
      setFunnels(list);
      setSelectedFunnelId((current) => current ?? list[0]?.id ?? null);
    } catch {
      setFunnels([]);
    } finally {
      setLoadingFunnels(false);
    }
  }, []);

  const loadAnalysis = useCallback(async () => {
    if (!selectedFunnelId) {
      setAnalysis(null);
      setAnalysisError(null);
      return;
    }

    setLoadingAnalysis(true);
    try {
      const data = await fetchJson<FunnelAnalysisDetail>(`/funnels/${selectedFunnelId}/analysis?period=${selectedTimeframe}`);
      setAnalysis({
        ...data,
        steps: Array.isArray(data.steps) ? data.steps : [],
      });
      setAnalysisError(null);
    } catch {
      setAnalysis(null);
      setAnalysisError('Live funnel analysis is unavailable right now.');
    } finally {
      setLoadingAnalysis(false);
    }
  }, [selectedFunnelId, selectedTimeframe]);

  useEffect(() => {
    void loadFunnels();
  }, [loadFunnels]);

  useEffect(() => {
    void loadAnalysis();
  }, [loadAnalysis]);

  const steps = analysis?.steps ?? [];
  const totalEntries = steps[0]?.users ?? 0;
  const overallConversion = steps.length > 0 ? steps[steps.length - 1].conversionRate : 0;
  const stepWithBestRetention = steps.reduce<{
    name: string;
    conversionRate: number;
  } | null>((best, step) => {
    if (!best || step.conversionRate > best.conversionRate) {
      return { name: step.name, conversionRate: step.conversionRate };
    }
    return best;
  }, null);

  const formatTime = (seconds: number | null | undefined) => {
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) {
      return 'Not available yet';
    }

    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getDropoffSeverity = (dropoffRate: number) => {
    if (dropoffRate > 50) return { color: 'text-red-600 bg-red-50', severity: 'Critical' };
    if (dropoffRate > 30) return { color: 'text-orange-600 bg-orange-50', severity: 'High' };
    if (dropoffRate > 15) return { color: 'text-yellow-600 bg-yellow-50', severity: 'Medium' };
    return { color: 'text-green-600 bg-green-50', severity: 'Low' };
  };

  const averageDropOff = steps.length
    ? Math.round(
        steps
          .slice(1)
          .reduce((sum, step) => sum + step.dropoffRate, 0) /
          (steps.length - 1 || 1)
      )
    : 0;

  const averageTimeToConvert = useMemo(() => {
    const timedSteps = steps.filter(
      (step) => typeof step.avgTimeToNext === 'number' && Number.isFinite(step.avgTimeToNext) && step.avgTimeToNext > 0
    );
    if (timedSteps.length === 0) {
      return null;
    }

    return Math.round(
      timedSteps.reduce((total, step) => total + (step.avgTimeToNext ?? 0), 0) / timedSteps.length
    );
  }, [steps]);

  const largestDropoffStep = useMemo(() => {
    return steps.slice(1).reduce<FunnelAnalysisStep | null>((current, step) => {
      if (!current || step.dropoffRate > current.dropoffRate) {
        return step;
      }

      return current;
    }, null);
  }, [steps]);

  const timeframeLabel = timeframeOptions.find((option) => option.value === selectedTimeframe)?.label ?? timeframeOptions[1].label;

  return (
    <div className="space-y-6">
      {/* FunnelBuilder modal */}
      {showBuilder && (
        <FunnelBuilder
          onClose={() => setShowBuilder(false)}
          onCreated={async (id) => {
            await loadFunnels();
            setSelectedFunnelId(id);
            setShowBuilder(false);
          }}
        />
      )}

      {/* Empty state — no funnels yet */}
      {!loadingFunnels && funnels.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center">
          <Target className="mb-4 h-12 w-12 text-gray-300" />
          <h3 className="mb-2 text-lg font-semibold text-gray-900">No funnels yet</h3>
          <p className="mb-6 text-sm text-gray-500">Create your first funnel to track user conversion paths with live session data.</p>
          <button
            onClick={() => setShowBuilder(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            <Plus className="h-4 w-4" />
            Create funnel
          </button>
        </div>
      )}

      {/* Funnel selector */}
      {funnels.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedFunnelId ?? ''}
            onChange={e => setSelectedFunnelId(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500"
          >
            {funnels.map(f => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          <button
            onClick={() => setShowBuilder(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            <Plus className="h-4 w-4" />
            New funnel
          </button>
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
            <Calendar className="h-4 w-4 text-gray-500" />
            <select
              value={selectedTimeframe}
              onChange={(e) => setSelectedTimeframe(e.target.value)}
              className="bg-transparent outline-none focus:ring-0"
            >
              {timeframeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => void loadAnalysis()}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      )}

      {/* Main analysis — only when funnel is selected and has data */}
      {funnels.length > 0 && selectedFunnelId && (
        <div className="space-y-6">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-sm text-primary-600">
              <Calendar className="h-4 w-4" />
              <span>{timeframeLabel}</span>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Live Funnel Analysis</h2>
              <p className="text-gray-600">
                This view only shows funnel metrics currently supported by the backend analysis route.
              </p>
            </div>
          </div>

          {analysisError && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              {analysisError}
            </div>
          )}

          {loadingAnalysis ? (
            <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500">
              Loading live funnel analysis…
            </div>
          ) : steps.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
              <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-gray-300" />
              <h3 className="text-lg font-medium text-gray-900">No funnel paths recorded yet</h3>
              <p className="mt-2 text-sm text-gray-600">
                Once sessions move through the URLs in this funnel, the live step counts will appear here.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-gray-200 bg-white p-4">
                  <div className="flex items-center gap-2 pb-2">
                    <Users className="h-5 w-5 text-primary-600" />
                    <span className="text-sm font-medium text-gray-600">Total Entries</span>
                  </div>
                  <div className="text-2xl font-bold text-gray-900">{totalEntries.toLocaleString()}</div>
                  <p className="text-xs text-gray-500">Users who reached the first funnel step.</p>
                </div>

                <div className="rounded-lg border border-gray-200 bg-white p-4">
                  <div className="flex items-center gap-2 pb-2">
                    <Target className="h-5 w-5 text-green-600" />
                    <span className="text-sm font-medium text-gray-600">Completion Rate</span>
                  </div>
                  <div className="text-2xl font-bold text-gray-900">{overallConversion.toFixed(1)}%</div>
                  <p className="text-xs text-gray-500">Share of first-step users who reached the last step.</p>
                </div>

                <div className="rounded-lg border border-gray-200 bg-white p-4">
                  <div className="flex items-center gap-2 pb-2">
                    <TrendingDown className="h-5 w-5 text-rose-600" />
                    <span className="text-sm font-medium text-gray-600">Average Drop-off</span>
                  </div>
                  <div className="text-2xl font-bold text-gray-900">{averageDropOff}%</div>
                  <p className="text-xs text-gray-500">Average loss between consecutive funnel steps.</p>
                </div>

                <div className="rounded-lg border border-gray-200 bg-white p-4">
                  <div className="flex items-center gap-2 pb-2">
                    <Clock className="h-5 w-5 text-orange-600" />
                    <span className="text-sm font-medium text-gray-600">Avg. Time to Next Step</span>
                  </div>
                  <div className="text-2xl font-bold text-gray-900">{formatTime(averageTimeToConvert)}</div>
                  <p className="text-xs text-gray-500">Based only on timings returned by the backend.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-gray-200 bg-white p-4">
                  <div className="flex items-center gap-2 pb-2">
                    <Target className="h-5 w-5 text-primary-600" />
                    <span className="text-sm font-medium text-gray-600">Best Performing Step</span>
                  </div>
                  {stepWithBestRetention ? (
                    <>
                      <p className="text-lg font-semibold text-gray-900">{stepWithBestRetention.name}</p>
                      <p className="text-sm text-green-600">{stepWithBestRetention.conversionRate.toFixed(1)}% retention</p>
                    </>
                  ) : (
                    <p className="text-sm text-gray-500">Add at least two funnel steps to evaluate step performance.</p>
                  )}
                </div>

                <div className="rounded-lg border border-gray-200 bg-white p-4">
                  <div className="flex items-center gap-2 pb-2">
                    <AlertTriangle className="h-5 w-5 text-amber-600" />
                    <span className="text-sm font-medium text-gray-600">Largest Drop-off</span>
                  </div>
                  {largestDropoffStep ? (
                    <>
                      <p className="text-lg font-semibold text-gray-900">{largestDropoffStep.name}</p>
                      <p className="text-sm text-amber-700">{largestDropoffStep.dropoffRate.toFixed(1)}% lost at this step</p>
                    </>
                  ) : (
                    <p className="text-sm text-gray-500">No drop-off data yet.</p>
                  )}
                </div>
              </div>

              {analysis?.ai && (
                <section className="rounded-[28px] border border-primary-200 bg-white p-6 shadow-sm">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="max-w-3xl">
                      <div className="inline-flex items-center gap-2 rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary-700">
                        <Sparkles className="h-3.5 w-3.5" />
                        Funnel AI brief
                      </div>
                      <h3 className="mt-3 text-2xl font-semibold text-surface-900">{analysis.ai.headline}</h3>
                      <p className="mt-3 text-sm leading-6 text-surface-600">{analysis.ai.summary}</p>
                    </div>
                    <p className="shrink-0 text-xs font-medium uppercase tracking-[0.18em] text-surface-500">
                      {new Date(analysis.ai.generatedAt).toLocaleString()}
                    </p>
                  </div>

                  <div className="mt-6 grid gap-4 md:grid-cols-2">
                    <div className="rounded-3xl border border-surface-200 bg-surface-50 p-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-surface-500">Biggest drop-off</p>
                      <p className="mt-2 text-sm leading-6 text-surface-700">
                        {analysis.ai.biggestDropoff || 'Not enough signal yet to identify a dominant leak.'}
                      </p>
                    </div>
                    <div className="rounded-3xl border border-surface-200 bg-surface-50 p-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-surface-500">Likely reason</p>
                      <p className="mt-2 text-sm leading-6 text-surface-700">
                        {analysis.ai.likelyReason || 'Not enough signal yet to describe a likely explanation.'}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-4 md:grid-cols-3">
                    {analysis.ai.evidence.slice(0, 3).map((item) => (
                      <div key={item.id} className={`rounded-3xl border p-5 ${evidenceToneClasses[item.tone]}`}>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em]">{item.label}</p>
                        <p className="mt-3 text-lg font-semibold text-surface-900">{item.value}</p>
                      </div>
                    ))}
                  </div>

                  {analysis.ai.recommendations.length > 0 && (
                    <div className="mt-6 rounded-3xl border border-surface-200 bg-surface-50 p-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-surface-500">Next actions</p>
                      <div className="mt-4 space-y-4">
                        {analysis.ai.recommendations.slice(0, 3).map((recommendation) => (
                          <div key={recommendation.id} className="rounded-2xl border border-surface-200 bg-white p-4">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                              <div className="max-w-2xl">
                                <p className="text-sm font-semibold text-surface-900">{recommendation.title}</p>
                                <p className="mt-2 text-sm leading-6 text-surface-600">{recommendation.detail}</p>
                              </div>
                              <Link
                                to={recommendation.href}
                                className="inline-flex shrink-0 items-center justify-center rounded-full bg-primary-600 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white transition hover:bg-primary-700"
                              >
                                Open
                              </Link>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              )}

              <div className="rounded-lg border border-gray-200 bg-white p-6">
                <h3 className="mb-6 text-lg font-semibold text-gray-900">Conversion Funnel</h3>

                <div className="space-y-6">
                  {steps.map((step, index) => {
                    const isLast = index === steps.length - 1;
                    const dropoffSeverity = getDropoffSeverity(step.dropoffRate);

                    return (
                      <div key={step.name} className="relative">
                        <div className="flex items-center space-x-6">
                          <div className="w-64 flex-shrink-0">
                            <div className="flex items-center space-x-4 rounded-lg bg-gray-50 p-4">
                              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-600 text-sm font-semibold text-white">
                                {index + 1}
                              </div>
                              <div>
                                <h4 className="font-medium text-gray-900">{step.name}</h4>
                                <p className="text-sm text-gray-600">{step.users.toLocaleString()} users</p>
                              </div>
                            </div>
                          </div>

                          <div className="flex-1">
                            <div className="relative">
                              <div className="h-12 overflow-hidden rounded-lg bg-gray-100">
                                <div
                                  className="h-full bg-gradient-to-r from-primary-500 to-primary-600 transition-all duration-500"
                                  style={{ width: `${step.conversionRate}%` }}
                                />
                              </div>
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-sm font-semibold text-white">{step.conversionRate}%</span>
                              </div>
                            </div>
                          </div>

                          <div className="w-48 flex-shrink-0 text-right">
                            <div className="text-lg font-semibold text-gray-900">{step.conversionRate}%</div>
                            {step.dropoffRate > 0 && (
                              <div className={`inline-flex items-center space-x-1 rounded-full px-2 py-1 text-sm ${dropoffSeverity.color}`}>
                                <TrendingDown className="h-3 w-3" />
                                <span>{step.dropoffRate}% drop-off</span>
                              </div>
                            )}
                            <div className="mt-1 text-xs text-gray-500">Avg. time: {formatTime(step.avgTimeToNext)}</div>
                          </div>
                        </div>

                        {!isLast && (
                          <div className="my-4 flex items-center justify-center">
                            <div className="h-8 w-px bg-gray-300" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
