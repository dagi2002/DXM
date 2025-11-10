import React from 'react';
import { TrendingDown, Users, Percent } from 'lucide-react';
import { mockFunnelData } from '../../data/mockData';

export const FunnelAnalysis: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Conversion Funnel</h2>
        <div className="flex items-center space-x-4 text-sm text-gray-600">
          <div className="flex items-center space-x-1">
            <Users className="h-4 w-4" />
            <span>10,000 total users</span>
          </div>
          <div className="flex items-center space-x-1">
            <Percent className="h-4 w-4" />
            <span>13.5% completion rate</span>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="space-y-4">
          {mockFunnelData.map((step, index) => {
            const isLast = index === mockFunnelData.length - 1;
            const nextStep = mockFunnelData[index + 1];
            
            return (
              <div key={step.name}>
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-4">
                    <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-semibold">
                      {index + 1}
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900">{step.name}</h3>
                      <p className="text-sm text-gray-600">{step.users.toLocaleString()} users</p>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className="text-lg font-semibold text-gray-900">{step.conversionRate}%</div>
                    {step.dropoffRate > 0 && (
                      <div className="text-sm text-red-600 flex items-center space-x-1">
                        <TrendingDown className="h-3 w-3" />
                        <span>{step.dropoffRate}% drop-off</span>
                      </div>
                    )}
                  </div>
                </div>

                {!isLast && nextStep && (
                  <div className="flex items-center justify-center my-2">
                    <div className="w-px h-8 bg-gray-300"></div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-6 pt-6 border-t border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">1,350</div>
              <div className="text-sm text-gray-600">Successful Conversions</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">8,650</div>
              <div className="text-sm text-gray-600">Drop-offs</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">$47,250</div>
              <div className="text-sm text-gray-600">Revenue Impact</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};