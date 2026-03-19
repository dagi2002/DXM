import React from 'react';
import { ChevronDown, ArrowDownRight, Users } from 'lucide-react';
import { mockUserFlowSteps, mockDropOffPoints } from '../../data/mockData';
import { UserFlowStep, DropOffPoint } from '../../types';

const columnHeaders = ['ENTRY', 'STEP 2', 'STEP 3', 'CONVERSION'];

const UserFlowView: React.FC = () => {
  const columns: UserFlowStep[][] = [[], [], [], []];
  mockUserFlowSteps.forEach((step) => {
    if (step.column >= 0 && step.column <= 3) {
      columns[step.column].push(step);
    }
  });

  return (
    <div className="p-6 md:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">User Flows</h1>
          <p className="text-gray-500 mt-1">Understand how users navigate your site</p>
        </div>
        <button className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-700 shadow-sm hover:bg-gray-50">
          Last 7 days
          <ChevronDown className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      {/* Flow Diagram */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm mb-8">
        <div className="grid grid-cols-4 gap-6">
          {columns.map((col, colIndex) => (
            <div key={colIndex}>
              <p className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-4">
                {columnHeaders[colIndex]}
              </p>
              <div className="flex flex-col gap-4">
                {col.map((step) => (
                  <div
                    key={step.id}
                    className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm"
                  >
                    <p className="font-mono text-sm text-gray-900">{step.page}</p>
                    <div className="mt-2">
                      <span className="text-xl font-bold text-gray-900">
                        {step.sessions.toLocaleString()}
                      </span>
                      <span className="text-xs text-gray-500 ml-1">sessions</span>
                    </div>
                    {step.targets.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-100 space-y-1">
                        {step.targets.map((t) => (
                          <div
                            key={t.page}
                            className="flex items-center gap-1 text-xs text-gray-500"
                          >
                            <span className="text-gray-300">&rarr;</span>
                            <span className="font-mono text-gray-600">{t.page}</span>
                            <span className="ml-auto font-medium text-gray-700">
                              {t.percent}%
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Drop-off Points */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Drop-off Points</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {mockDropOffPoints.map((point: DropOffPoint) => (
            <div
              key={point.page}
              className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-900 font-mono">{point.page}</p>
                <ArrowDownRight className="w-4 h-4 text-red-500" />
              </div>
              <div className="mt-3">
                <span className="text-2xl font-bold text-red-500">{point.dropOffRate}%</span>
                <span className="text-sm text-gray-500 ml-1">drop-off rate</span>
              </div>
              <div className="mt-3">
                <div className="h-2 bg-red-100 rounded-full overflow-hidden">
                  <div
                    className="h-2 bg-red-500 rounded-full"
                    style={{ width: `${point.dropOffRate}%` }}
                  />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-sm text-gray-500">
                <Users className="w-4 h-4" />
                <span>{point.usersLeft.toLocaleString()} users left</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default UserFlowView;
