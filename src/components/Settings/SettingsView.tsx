import React, { useState } from 'react';
import {
  Plus,
  Globe,
  ExternalLink,
  Trash2,
  Copy,
  Code,
  Check,
} from 'lucide-react';
import { mockWebsiteConfig } from '../../data/mockData';

const SettingsView: React.FC = () => {
  const [copiedId, setCopiedId] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  const config = mockWebsiteConfig;

  const snippet = `<!-- DXM Pulse Tracking -->
<script>
  (function(d,k,m){
    var s=d.createElement('script');
    s.src='https://cdn.dxmpulse.com/tracker.js';
    s.setAttribute('data-id','${config.trackingId}');
    d.head.appendChild(s);
  })(document);
</script>`;

  const handleCopyId = () => {
    navigator.clipboard.writeText(config.trackingId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleCopySnippet = () => {
    navigator.clipboard.writeText(snippet);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  return (
    <div className="p-6 md:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
          <p className="text-gray-500 mt-1">
            Manage your tracked websites and configuration
          </p>
        </div>
        <button className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-4 py-2 flex items-center gap-2 text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" />
          Add Website
        </button>
      </div>

      {/* Website Card */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <Globe className="w-5 h-5 text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-900">{config.name}</h2>
          <span className="bg-green-100 text-green-700 text-xs font-medium rounded-full px-2 py-0.5">
            {config.status}
          </span>
          <a
            href={config.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-600 text-sm hover:underline flex items-center gap-1"
          >
            {config.url}
            <ExternalLink className="w-3 h-3" />
          </a>
          <button className="ml-auto p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-gray-50 transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {/* Tracking ID */}
        <div className="mt-6">
          <label className="text-xs text-gray-500 uppercase tracking-wider font-medium">
            Tracking ID
          </label>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 font-mono text-gray-900">
              {config.trackingId}
            </div>
            <button
              onClick={handleCopyId}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
            >
              {copiedId ? (
                <Check className="w-4 h-4 text-green-500" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* Install Snippet */}
        <div className="mt-6">
          <div className="flex items-center gap-1.5">
            <Code className="w-3.5 h-3.5 text-gray-400" />
            <label className="text-xs text-gray-500 uppercase tracking-wider font-medium">
              Install snippet
            </label>
          </div>
          <div className="mt-2 relative">
            <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 font-mono text-sm overflow-x-auto">
              {snippet}
            </pre>
            <button
              onClick={handleCopySnippet}
              className="absolute top-3 right-3 p-1.5 rounded text-gray-400 hover:text-gray-200 transition-colors"
            >
              {copiedSnippet ? (
                <Check className="w-4 h-4 text-green-400" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-8">
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm text-center">
          <p className="text-3xl font-bold text-gray-900">
            {config.totalSessions.toLocaleString()}
          </p>
          <p className="text-sm text-gray-500 mt-1">Total Sessions</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm text-center">
          <p className="text-3xl font-bold text-gray-900">
            {config.totalPageviews.toLocaleString()}
          </p>
          <p className="text-sm text-gray-500 mt-1">Total Pageviews</p>
        </div>
      </div>
    </div>
  );
};

export default SettingsView;
