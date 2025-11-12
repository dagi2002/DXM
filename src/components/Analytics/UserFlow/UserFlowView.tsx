import React from 'react';
import { mockUserFlowData } from '../../../data/mockData';

export const UserFlowView: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">User Flow Explorer</h2>
          <p className="text-sm text-gray-600">Visualize the top outbound paths from each key page</p>
        </div>
        <span className="text-sm text-gray-500">Mock data · Last 7 days</span>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6 overflow-x-auto">
        <div className="flex items-start gap-4 min-w-max pb-4 px-1">
          {mockUserFlowData.map((node, index) => (
            <React.Fragment key={node.page}>
              <div className="flex flex-col space-y-4 min-w-[240px]">
                <div className="rounded-2xl border border-gray-200 bg-white px-6 py-4 shadow-sm hover:shadow-md transition-all duration-200">
                  <div className="inline-block text-[10px] font-semibold uppercase tracking-wide text-blue-600 bg-blue-50 px-2 py-1 rounded-md">
                    PAGE
                  </div>
                  <h3 className="mt-1 text-lg font-semibold text-gray-900">{node.page}</h3>
                  <p className="mt-2 text-sm text-gray-500">{node.users.toLocaleString()} users</p>
                </div>

                <ul className="space-y-2">
                  {node.next.map((path) => {
                    const isExit = path.target.toLowerCase() === 'exit';
                    const percentClass = isExit ? 'text-red-700' : 'text-gray-900';
                    const targetClass = isExit ? 'text-red-600' : 'text-gray-500';

                    return (
                      <li
                        key={`${node.page}-${path.target}`}
                        className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm font-medium transition-all duration-200 hover:scale-[1.02] ${
                          isExit
                            ? 'border-red-200 bg-red-50 text-red-700'
                            : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'
  }`}
>

                        <span className="text-base text-gray-400">•</span>
                        <span className={percentClass}>{path.percent}%</span>
                        <span className={targetClass}>→ {isExit ? 'Exit' : path.target}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {index < mockUserFlowData.length - 1 && (
                <div className="flex items-center justify-center px-2">
                <span className="text-gray-300 text-2xl">→</span>
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
};