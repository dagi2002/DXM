import React from 'react';
import { mockTopPages } from '../../data/mockData';

export const TopPagesTable: React.FC = () => {
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="p-6 pb-0">
        <h3 className="text-base font-semibold text-gray-900">Top Pages</h3>
        <p className="text-sm text-gray-500 mt-0.5">Last 7 days</p>
      </div>

      <div className="mt-4">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left text-xs text-gray-500 uppercase tracking-wider font-medium px-6 py-3">
                Page
              </th>
              <th className="text-left text-xs text-gray-500 uppercase tracking-wider font-medium px-6 py-3">
                Views
              </th>
              <th className="text-left text-xs text-gray-500 uppercase tracking-wider font-medium px-6 py-3">
                Avg Time
              </th>
              <th className="text-left text-xs text-gray-500 uppercase tracking-wider font-medium px-6 py-3">
                Scroll Depth
              </th>
              <th className="text-left text-xs text-gray-500 uppercase tracking-wider font-medium px-6 py-3">
                Bounce
              </th>
            </tr>
          </thead>
          <tbody>
            {mockTopPages.map((page) => (
              <tr key={page.path} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50">
                <td className="px-6 py-4">
                  <p className="font-medium text-gray-900 text-sm">{page.name}</p>
                  <p className="text-gray-500 text-xs">{page.path}</p>
                </td>
                <td className="px-6 py-4 text-sm text-gray-900 font-medium">
                  {page.views.toLocaleString()}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">{page.avgTime}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full max-w-[80px]">
                      <div
                        className="h-1.5 bg-indigo-500 rounded-full"
                        style={{ width: `${page.scrollDepth}%` }}
                      />
                    </div>
                    <span className="text-sm text-gray-600">{page.scrollDepth}%</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">{page.bounceRate}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
