import React, { useEffect, useMemo, useState } from 'react';
import type { UserFlowNode } from '../../../types';

const DEFAULT_API_BASE = 'http://localhost:4000';

const getStrengthStyles = (percent: number) => {
  if (percent >= 50) {
    return {
      container: 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100',
      percent: 'text-green-700',
      target: 'text-green-600',
      bullet: 'text-green-500',
    };
  }

  if (percent >= 25) {
    return {
      container: 'border-yellow-200 bg-yellow-50 text-yellow-700 hover:bg-yellow-100',
      percent: 'text-yellow-700',
      target: 'text-yellow-600',
      bullet: 'text-yellow-500',
    };
  }

  return {
    container: 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100',
    percent: 'text-red-700',
    target: 'text-red-600',
    bullet: 'text-red-500',
  };
};

const formatPercent = (value: number) => {
  if (!Number.isFinite(value)) return '0';
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
};

export const UserFlowView: React.FC = () => {
  const [flowData, setFlowData] = useState<UserFlowNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const apiBaseUrl = useMemo(() => {
    const configured = import.meta.env.VITE_API_URL as string | undefined;
    return configured && configured.trim().length > 0 ? configured : DEFAULT_API_BASE;
  }, []);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    const loadFlow = async () => {
      try {
        const response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/userflow`, { signal: controller.signal });
        if (!response.ok) {
          throw new Error('Failed to load user flow data');
        }

        const data = await response.json() as UserFlowNode[];
        if (!isMounted) return;

        setFlowData(Array.isArray(data) ? data : []);
        setError(null);
      } catch (err) {
        if (!isMounted || (err instanceof DOMException && err.name === 'AbortError')) {
          return;
        }
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
        setFlowData([]);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadFlow();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [apiBaseUrl]);

  // 🔮 FUTURE: Add Path Conversion Impact (P10: AI Insight Engine)
  // <DXM_INSERT_ANALYTICS>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">User Flow Explorer</h2>
          <p className="text-sm text-gray-600">Visualize the top outbound paths from each key page</p>
        </div>
        <span className="text-sm text-gray-500">Live data · Last 7 days</span>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6 overflow-x-auto">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center text-sm text-gray-500">Loading user flow…</div>
        ) : error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        ) : flowData.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-gray-500">
            No user flow data available yet.
          </div>
        ) : (
          <div className="flex items-start gap-4 min-w-max pb-4 px-1">
            {flowData.map((node, index) => (
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
                      const styles = getStrengthStyles(path.percent);
                      const formattedPercent = formatPercent(path.percent);

                      return (
                        <li
                          key={`${node.page}-${path.target}`}
                          className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm font-medium transition-all duration-200 hover:scale-[1.02] ${styles.container}`}
                        >
                          <span className={`text-base ${styles.bullet}`}>•</span>
                          <span className={`text-sm font-semibold ${styles.percent}`}>{formattedPercent}%</span>
                          <span className={`text-sm ${styles.target}`}>→ {isExit ? 'Exit' : path.target}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                {index < flowData.length - 1 && (
                  <div className="flex items-center justify-center px-2">
                    <span className="text-gray-300 text-2xl">→</span>
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};