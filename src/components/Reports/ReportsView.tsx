import React from 'react';
import {
  Plus,
  FileText,
  Calendar,
  Eye,
  Share2,
  Trash2,
} from 'lucide-react';
import { mockReports } from '../../data/mockData';
import { Report } from '../../types';

const typeStyles: Record<string, { icon: string; badge: string }> = {
  weekly: {
    icon: 'bg-indigo-50 text-indigo-600',
    badge: 'bg-indigo-100 text-indigo-700',
  },
  behavior: {
    icon: 'bg-orange-50 text-orange-500',
    badge: 'bg-orange-100 text-orange-700',
  },
  custom: {
    icon: 'bg-purple-50 text-purple-600',
    badge: 'bg-purple-100 text-purple-700',
  },
};

const statusStyles: Record<string, string> = {
  published: 'bg-green-100 text-green-700',
  draft: 'bg-gray-100 text-gray-600',
};

const ReportsView: React.FC = () => {
  return (
    <div className="p-6 md:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Reports</h1>
          <p className="text-gray-500 mt-1">
            Generate and share behavior insights
          </p>
        </div>
        <button className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-4 py-2 flex items-center gap-2 text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" />
          New Report
        </button>
      </div>

      {/* Report Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {mockReports.map((report: Report) => {
          const style = typeStyles[report.type] || typeStyles.custom;
          return (
            <div
              key={report.id}
              className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center ${style.icon}`}
                >
                  <FileText className="w-5 h-5" />
                </div>
                <span
                  className={`text-xs font-medium rounded-full px-2.5 py-0.5 ${style.badge}`}
                >
                  {report.type}
                </span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mt-3">
                {report.title}
              </h3>
              <p className="text-sm text-gray-500 mt-1">{report.description}</p>
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                <div className="flex items-center gap-1.5 text-sm text-gray-500">
                  <Calendar className="w-4 h-4" />
                  {report.createdAt.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </div>
                <span
                  className={`text-xs font-medium rounded-full px-2.5 py-0.5 ${statusStyles[report.status]}`}
                >
                  {report.status}
                </span>
                <div className="flex items-center gap-1">
                  <button className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors">
                    <Eye className="w-4 h-4" />
                  </button>
                  <button className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors">
                    <Share2 className="w-4 h-4" />
                  </button>
                  <button className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-gray-50 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ReportsView;
