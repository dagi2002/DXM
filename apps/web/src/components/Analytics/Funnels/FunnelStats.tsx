import React from 'react';
import { ArrowDownRight, ArrowUpRight, Target } from 'lucide-react';

interface FunnelStatsProps {
  totalSessions: number;
  conversionRate: number;
  dropOffRate: number;
  bestStep?: { name: string; conversionRate: number } | null;
}

const formatPercent = (value: number): string => {
  if (!Number.isFinite(value)) {
    return '0%';
  }
  return `${Math.max(0, value).toFixed(1)}%`;
};

export const FunnelStats: React.FC<FunnelStatsProps> = ({
  totalSessions,
  conversionRate,
  dropOffRate,
  bestStep,
}) => {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-gray-100 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Total Sessions</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-gray-900">{totalSessions.toLocaleString()}</span>
            <span className="text-xs text-gray-500">analysed</span>
          </div>
        </div>

        <div className="rounded-lg border border-gray-100 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Overall Conversion</p>
          <div className="mt-2 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <ArrowUpRight className="h-5 w-5" />
            </div>
            <span className="text-2xl font-bold text-emerald-600">{formatPercent(conversionRate)}</span>
          </div>
        </div>

        <div className="rounded-lg border border-gray-100 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Total Drop-off</p>
          <div className="mt-2 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100 text-rose-600">
              <ArrowDownRight className="h-5 w-5" />
            </div>
            <span className="text-2xl font-bold text-rose-600">{formatPercent(dropOffRate)}</span>
          </div>
        </div>

        <div className="rounded-lg border border-gray-100 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Best Performing Step</p>
          {bestStep ? (
            <div className="mt-2">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                  <Target className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{bestStep.name}</p>
                  <p className="text-xs text-gray-500">{formatPercent(bestStep.conversionRate)} retention</p>
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-gray-500">Add at least two steps to see performance.</p>
          )}
        </div>
      </div>
    </div>
  );
};