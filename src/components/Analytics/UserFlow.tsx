import React from 'react';
import { ArrowRight, MousePointer, ExternalLink } from 'lucide-react';

export const UserFlow: React.FC = () => {
  const flowData = [
    { page: '/home', users: 10000, nextPages: [
      { page: '/products', users: 4200, percentage: 42 },
      { page: '/about', users: 2800, percentage: 28 },
      { page: '/contact', users: 1500, percentage: 15 },
      { page: 'Exit', users: 1500, percentage: 15 }
    ]},
    { page: '/products', users: 4200, nextPages: [
      { page: '/product/detail', users: 2100, percentage: 50 },
      { page: '/pricing', users: 1050, percentage: 25 },
      { page: '/home', users: 630, percentage: 15 },
      { page: 'Exit', users: 420, percentage: 10 }
    ]},
    { page: '/product/detail', users: 2100, nextPages: [
      { page: '/cart', users: 945, percentage: 45 },
      { page: '/products', users: 420, percentage: 20 },
      { page: '/pricing', users: 315, percentage: 15 },
      { page: 'Exit', users: 420, percentage: 20 }
    ]}
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">User Flow Analysis</h2>
        <div className="text-sm text-gray-600">Showing top paths for the last 7 days</div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6 overflow-x-auto">
        <div className="flex space-x-8 min-w-max">
          {flowData.map((step, stepIndex) => (
            <div key={step.page} className="flex items-center">
              <div className="flex flex-col items-center space-y-4">
                {/* Page Node */}
                <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4 text-center min-w-[150px]">
                  <div className="flex items-center justify-center space-x-2 mb-2">
                    <ExternalLink className="h-4 w-4 text-blue-600" />
                    <span className="font-medium text-gray-900">{step.page}</span>
                  </div>
                  <div className="text-2xl font-bold text-blue-600">{step.users.toLocaleString()}</div>
                  <div className="text-sm text-gray-600">users</div>
                </div>

                {/* Flow Lines */}
                <div className="space-y-2">
                  {step.nextPages.map((nextPage, index) => (
                    <div
                      key={`${step.page}-${nextPage.page}`}
                      className={`flex items-center space-x-2 text-sm p-2 rounded ${
                        nextPage.page === 'Exit' ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-700'
                      }`}
                    >
                      <div className="w-2 h-2 rounded-full bg-current opacity-60"></div>
                      <span className="font-medium">{nextPage.percentage}%</span>
                      <span>to {nextPage.page}</span>
                    </div>
                  ))}
                </div>
              </div>

              {stepIndex < flowData.length - 1 && (
                <ArrowRight className="h-6 w-6 text-gray-400 mx-6" />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white border border-gray-200 rounded-lg p-6 text-center">
          <div className="text-2xl font-bold text-gray-900">3.2</div>
          <div className="text-sm text-gray-600">Avg. Pages per Session</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-6 text-center">
          <div className="text-2xl font-bold text-gray-900">68%</div>
          <div className="text-sm text-gray-600">Multi-page Sessions</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-6 text-center">
          <div className="text-2xl font-bold text-gray-900">4m 17s</div>
          <div className="text-sm text-gray-600">Avg. Time on Site</div>
        </div>
      </div>
    </div>
  );
};