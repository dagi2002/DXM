import React, { useState } from 'react';
import { MousePointer, Eye, Move } from 'lucide-react';
import { mockHeatmapData } from '../../data/mockData';

export const HeatmapVisualization: React.FC = () => {
  const [heatmapType, setHeatmapType] = useState<'click' | 'scroll' | 'hover'>('click');

  const filteredData = mockHeatmapData.filter(point => point.type === heatmapType);

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <h2 className="text-xl font-semibold text-gray-900">Heatmap Analysis</h2>
        
        <div className="flex bg-gray-100 rounded-lg p-1">
          {[
            { type: 'click' as const, label: 'Clicks', icon: MousePointer },
            { type: 'scroll' as const, label: 'Scrolls', icon: Move },
            { type: 'hover' as const, label: 'Hovers', icon: Eye }
          ].map(({ type, label, icon: Icon }) => (
            <button
              key={type}
              onClick={() => setHeatmapType(type)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                heatmapType === type
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="mb-4">
              <h3 className="font-medium text-gray-900">Page: /homepage</h3>
              <p className="text-sm text-gray-600">Showing {heatmapType} heatmap data</p>
            </div>
            
            <div className="relative bg-gray-50 rounded-lg" style={{ height: '600px' }}>
              {/* Simulated webpage background */}
              <div className="absolute inset-4 bg-white rounded-lg shadow-sm p-6">
                <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
                <div className="space-y-2 mb-6">
                  <div className="h-4 bg-gray-100 rounded w-full"></div>
                  <div className="h-4 bg-gray-100 rounded w-3/4"></div>
                  <div className="h-4 bg-gray-100 rounded w-1/2"></div>
                </div>
                <div className="h-10 bg-blue-100 rounded w-32 mb-6"></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="h-32 bg-gray-100 rounded"></div>
                  <div className="h-32 bg-gray-100 rounded"></div>
                </div>
              </div>

              {/* Heatmap Points */}
              {filteredData.map((point, index) => (
                <div
                  key={index}
                  className="absolute rounded-full pointer-events-none animate-pulse"
                  style={{
                    left: `${(point.x / 1200) * 100}%`,
                    top: `${(point.y / 800) * 100}%`,
                    width: `${8 + point.intensity * 12}px`,
                    height: `${8 + point.intensity * 12}px`,
                    backgroundColor: `rgba(59, 130, 246, ${0.3 + point.intensity * 0.6})`,
                    transform: 'translate(-50%, -50%)'
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h4 className="font-medium text-gray-900 mb-3">Intensity Legend</h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">High</span>
                <div className="w-4 h-4 bg-blue-600 rounded-full"></div>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Medium</span>
                <div className="w-4 h-4 bg-blue-400 rounded-full"></div>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Low</span>
                <div className="w-4 h-4 bg-blue-200 rounded-full"></div>
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h4 className="font-medium text-gray-900 mb-3">Statistics</h4>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Total {heatmapType}s:</span>
                <span className="font-medium">{filteredData.length * 10}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Unique visitors:</span>
                <span className="font-medium">2,847</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Avg. per session:</span>
                <span className="font-medium">{Math.round(filteredData.length * 10 / 2847 * 100) / 100}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};