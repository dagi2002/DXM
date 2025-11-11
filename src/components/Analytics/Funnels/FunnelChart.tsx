import React from 'react';

export interface FunnelStepResult {
  stepName: string;
  count: number;
  dropOff: number;
  conversionRate: number;
}

interface FunnelChartProps {
  steps: FunnelStepResult[];
  isLoading?: boolean;
}

const formatPercent = (value: number): string => {
  if (!Number.isFinite(value)) {
    return '0%';
  }
  return `${Math.max(0, value).toFixed(1)}%`;
};

export const FunnelChart: React.FC<FunnelChartProps> = ({ steps, isLoading }) => {
  if (isLoading) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded" />
          <div className="h-4 bg-gray-200 rounded" />
          <div className="h-4 bg-gray-200 rounded" />
          <div className="h-4 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  if (!steps.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6 text-center text-sm text-gray-600">
        Define at least one step to see funnel performance.
      </div>
    );
  }

  const baseline = steps[0]?.count ?? 0;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <div className="space-y-6">
        {steps.map((step, index) => {
          const previousCount = index === 0 ? step.count : steps[index - 1]?.count ?? 0;
          const dropOffRate = previousCount > 0 ? ((previousCount - step.count) / previousCount) * 100 : 0;
          const widthPercent = baseline > 0 ? (step.count / baseline) * 100 : 0;

          return (
            <div key={step.stepName} className="space-y-3">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Step {index + 1}</p>
                  <h3 className="text-base font-semibold text-gray-900">{step.stepName}</h3>
                </div>
                <div className="text-sm text-gray-600">
                  <span className="font-semibold text-gray-900">{step.count.toLocaleString()}</span> sessions
                </div>
              </div>

              <div className="h-4 bg-blue-100/70 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-blue-600"
                  style={{ width: `${Math.max(0, Math.min(widthPercent, 100))}%` }}
                />
              </div>

              <div className="flex flex-col gap-1 text-xs text-gray-600 sm:flex-row sm:items-center sm:justify-between">
                <div>Conversion from previous: <span className="font-medium text-gray-900">{formatPercent(step.conversionRate)}</span></div>
                {index > 0 && (
                  <div>Drop-off: <span className="font-medium text-rose-500">{formatPercent(dropOffRate)}</span></div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
