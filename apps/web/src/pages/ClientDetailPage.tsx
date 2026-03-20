import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, CheckCircle2, Copy, Gauge, PlayCircle, Radar } from 'lucide-react';
import { fetchJson } from '../lib/api';
import type { ClientSiteDetail } from '../types';

const formatDateTime = (value: string | null) => {
  if (!value) return 'No activity yet';
  return new Date(value).toLocaleString();
};

const formatDuration = (seconds: number) => {
  if (!seconds) return '0s';
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${seconds}s`;
};

const formatMetricKey = (key: string) => key.toUpperCase();

export const ClientDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [client, setClient] = useState<ClientSiteDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const vitalsEntries = useMemo(() => Object.entries(client?.vitals || {}), [client?.vitals]);

  const loadClient = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      const data = await fetchJson<ClientSiteDetail>(`/sites/${id}`);
      setClient(data);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load client site');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadClient();
  }, [loadClient]);

  const handleVerify = async () => {
    if (!id) return;
    setIsVerifying(true);
    try {
      await fetchJson(`/sites/${id}/verify`);
      await loadClient();
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : 'Verification failed');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleCopy = async () => {
    if (!client) return;
    await navigator.clipboard.writeText(client.snippet);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl p-6 md:p-8">
        <div className="rounded-[28px] border border-surface-200 bg-white p-12 text-center shadow-sm">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
          <p className="mt-4 text-sm text-surface-500">Loading client detail…</p>
        </div>
      </div>
    );
  }

  if (error || !client) {
    return (
      <div className="mx-auto max-w-7xl p-6 md:p-8">
        <div className="rounded-[28px] border border-red-200 bg-red-50 p-10 text-center text-red-700">
          {error || 'Client not found'}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-6 md:p-8">
      <Link to="/clients" className="inline-flex items-center gap-2 text-sm font-medium text-surface-500 hover:text-surface-800">
        <ArrowLeft className="h-4 w-4" />
        Back to clients
      </Link>

      <div className="mt-4 rounded-[32px] border border-primary-200 bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 p-6 text-white shadow-xl md:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-primary-100">
              Client detail
            </div>
            <h1 className="mt-4 text-3xl font-bold md:text-5xl">{client.name}</h1>
            <p className="mt-2 text-base text-primary-100">{client.domain}</p>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-primary-100">
              This is the agency-facing operating view for the client site: install status, alert posture, recent traffic, and the metrics you can use in client updates.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-white/10 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-primary-100">Health score</p>
              <p className="mt-2 text-3xl font-semibold">{client.healthScore}/100</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/10 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-primary-100">Tracking status</p>
              <p className="mt-2 text-xl font-semibold">
                {client.verified ? 'Live and verified' : 'Waiting for installation'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-4">
        {[
          { label: 'Sessions (7d)', value: client.sessionCount7d.toLocaleString() },
          { label: 'Open alerts', value: client.openAlerts },
          { label: 'Avg. duration', value: formatDuration(client.avgDurationSeconds) },
          { label: 'Conversion', value: `${client.conversionRate}%` },
        ].map((metric) => (
          <div key={metric.label} className="rounded-3xl border border-surface-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-surface-500">{metric.label}</p>
            <p className="mt-3 text-2xl font-bold text-surface-900">{metric.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-[28px] border border-surface-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 text-surface-900">
            <CheckCircle2 className="h-5 w-5 text-primary-600" />
            <h2 className="text-xl font-semibold">Install and verification</h2>
          </div>
          <p className="mt-3 text-sm leading-6 text-surface-600">
            Use this snippet on the client site. Once traffic hits, DXM Pulse will start rolling the site into portfolio reporting automatically.
          </p>

          <div className="mt-5 rounded-3xl bg-surface-950 p-4 text-xs text-emerald-300">
            <pre className="overflow-x-auto whitespace-pre-wrap break-all">{client.snippet}</pre>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-2 rounded-2xl bg-primary-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary-700"
            >
              <Copy className="h-4 w-4" />
              {copied ? 'Snippet copied' : 'Copy snippet'}
            </button>
            <button
              onClick={handleVerify}
              disabled={isVerifying}
              className="inline-flex items-center gap-2 rounded-2xl border border-surface-200 bg-white px-4 py-3 text-sm font-semibold text-surface-700 transition hover:border-primary-300 hover:text-primary-700 disabled:opacity-60"
            >
              {isVerifying ? 'Checking…' : 'Verify installation'}
            </button>
          </div>

          <div className="mt-4 rounded-3xl border border-surface-200 bg-surface-50 p-4">
            <p className="text-sm font-semibold text-surface-900">
              {client.verified ? 'Tracking is live.' : 'Still waiting for the first tracked session.'}
            </p>
            <p className="mt-1 text-sm text-surface-600">
              Last activity: {formatDateTime(client.lastActivityAt)}
            </p>
          </div>
        </section>

        <section className="rounded-[28px] border border-surface-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 text-surface-900">
            <Gauge className="h-5 w-5 text-primary-600" />
            <h2 className="text-xl font-semibold">Vitals snapshot</h2>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {vitalsEntries.length === 0 && (
              <div className="rounded-3xl border border-dashed border-surface-200 bg-surface-50 p-6 text-sm text-surface-500 sm:col-span-2">
                No Web Vitals have been collected yet for this site.
              </div>
            )}
            {vitalsEntries.map(([key, value]) => (
              <div key={key} className="rounded-3xl border border-surface-200 bg-surface-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-surface-500">
                  {formatMetricKey(key)}
                </p>
                <p className="mt-3 text-2xl font-semibold text-surface-900">{value.p75}</p>
                <p className="mt-2 text-sm text-surface-600">
                  p50 {value.p50} • p95 {value.p95}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1fr]">
        <section className="rounded-[28px] border border-surface-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 text-surface-900">
            <AlertTriangle className="h-5 w-5 text-primary-600" />
            <h2 className="text-xl font-semibold">Open alerts</h2>
          </div>
          <div className="mt-5 space-y-4">
            {client.openAlertsList.length === 0 && (
              <div className="rounded-3xl border border-dashed border-surface-200 bg-surface-50 p-6 text-sm text-surface-500">
                No open alerts on this client site.
              </div>
            )}
            {client.openAlertsList.map((alert) => (
              <div key={alert.id} className="rounded-3xl border border-surface-200 bg-surface-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-surface-900">{alert.title}</p>
                  <span className="rounded-full bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                    {alert.severity}
                  </span>
                </div>
                <p className="mt-2 text-sm text-surface-600">{alert.description || 'No extra detail provided.'}</p>
                <p className="mt-3 text-xs text-surface-500">
                  {alert.affectedSessions} affected sessions • {new Date(alert.createdAt).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[28px] border border-surface-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 text-surface-900">
            <PlayCircle className="h-5 w-5 text-primary-600" />
            <h2 className="text-xl font-semibold">Recent sessions</h2>
          </div>
          <div className="mt-5 space-y-4">
            {client.recentSessions.length === 0 && (
              <div className="rounded-3xl border border-dashed border-surface-200 bg-surface-50 p-6 text-sm text-surface-500">
                No sessions have been recorded yet.
              </div>
            )}
            {client.recentSessions.map((session) => (
              <Link
                key={session.id}
                to="/sessions"
                className="block rounded-3xl border border-surface-200 bg-surface-50 p-4 transition hover:border-primary-300 hover:bg-white"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-surface-900">{session.entryUrl}</p>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold capitalize text-surface-600">
                    {session.device}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between text-sm text-surface-600">
                  <span>{formatDuration(session.duration)}</span>
                  <span>{formatDateTime(session.startedAt)}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-[28px] border border-surface-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2 text-surface-900">
          <Radar className="h-5 w-5 text-primary-600" />
          <h2 className="text-xl font-semibold">Funnels and growth surfaces</h2>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {client.funnels.length === 0 && (
            <div className="rounded-3xl border border-dashed border-surface-200 bg-surface-50 p-6 text-sm text-surface-500 md:col-span-3">
              No funnels are configured for this client yet. Use Analytics to define conversion steps that matter to the account.
            </div>
          )}
          {client.funnels.map((funnel) => (
            <Link
              key={funnel.id}
              to="/analytics"
              className="rounded-3xl border border-surface-200 bg-surface-50 p-5 transition hover:border-primary-300 hover:bg-white"
            >
              <p className="text-lg font-semibold text-surface-900">{funnel.name}</p>
              <p className="mt-2 text-sm text-surface-600">{funnel.stepCount} configured steps</p>
              <p className="mt-4 text-xs text-surface-500">Created {new Date(funnel.createdAt).toLocaleDateString()}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
};
