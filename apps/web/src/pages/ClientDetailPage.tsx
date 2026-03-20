import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  Copy,
  Gauge,
  Loader2,
  PencilLine,
  PlayCircle,
  Radar,
  Save,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import { fetchJson, getApiUrl } from '../lib/api';
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
const normalizeDomainInput = (value: string) => value.trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');

interface DeleteBlockers {
  sessions: number;
  replays: number;
  alerts: number;
  funnels: number;
}

export const ClientDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [client, setClient] = useState<ClientSiteDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleteConfirming, setIsDeleteConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteBlockers, setDeleteBlockers] = useState<DeleteBlockers | null>(null);
  const [editForm, setEditForm] = useState({ name: '', domain: '' });

  const vitalsEntries = useMemo(() => Object.entries(client?.vitals || {}), [client?.vitals]);
  const hasPendingChanges =
    !!client &&
    (editForm.name.trim() !== client.name || normalizeDomainInput(editForm.domain) !== client.domain);

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

  useEffect(() => {
    if (!client || isEditing) return;
    setEditForm({ name: client.name, domain: client.domain });
  }, [client, isEditing]);

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

  const handleEditToggle = () => {
    if (!client) return;
    setEditError(null);
    setEditSuccess(null);
    setEditForm({ name: client.name, domain: client.domain });
    setIsEditing(true);
  };

  const handleEditCancel = () => {
    if (!client) return;
    setEditError(null);
    setEditForm({ name: client.name, domain: client.domain });
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!id || !client) return;
    const nextName = editForm.name.trim();
    const nextDomain = editForm.domain.trim();

    if (!nextName || !nextDomain) {
      setEditError('Name and domain are required.');
      return;
    }

    setIsSaving(true);
    setEditError(null);
    setEditSuccess(null);

    try {
      const response = await fetch(getApiUrl(`/sites/${id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: nextName,
          domain: nextDomain,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: 'Failed to update client site' }));
        throw new Error(payload.error || 'Failed to update client site');
      }

      const updatedClient = (await response.json()) as ClientSiteDetail;
      setClient(updatedClient);
      setEditForm({ name: updatedClient.name, domain: updatedClient.domain });
      setIsEditing(false);
      setEditSuccess('Client site updated.');
    } catch (saveError) {
      setEditError(saveError instanceof Error ? saveError.message : 'Failed to update client site');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteStart = () => {
    setDeleteError(null);
    setDeleteBlockers(null);
    setIsDeleteConfirming(true);
  };

  const handleDeleteCancel = () => {
    setDeleteError(null);
    setDeleteBlockers(null);
    setIsDeleteConfirming(false);
  };

  const handleDelete = async () => {
    if (!id || !client) return;

    setIsDeleting(true);
    setDeleteError(null);
    setDeleteBlockers(null);

    try {
      const response = await fetch(getApiUrl(`/sites/${id}`), {
        method: 'DELETE',
        credentials: 'include',
      });

      if (response.status === 204) {
        navigate('/clients', {
          replace: true,
          state: { flashMessage: `Client site "${client.name}" deleted.` },
        });
        return;
      }

      const payload = await response
        .json()
        .catch(() => ({ error: 'Failed to delete client site', blockers: null as DeleteBlockers | null }));

      if (response.status === 409) {
        setDeleteError(payload.error || 'Client site cannot be deleted because dependent data exists.');
        setDeleteBlockers(payload.blockers ?? null);
        return;
      }

      throw new Error(payload.error || 'Failed to delete client site');
    } catch (deleteSiteError) {
      setDeleteError(deleteSiteError instanceof Error ? deleteSiteError.message : 'Failed to delete client site');
    } finally {
      setIsDeleting(false);
    }
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

      <section className="mt-6 rounded-[28px] border border-surface-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-surface-900">
              <Building2 className="h-5 w-5 text-primary-600" />
              <h2 className="text-xl font-semibold">Client profile</h2>
            </div>
            <p className="mt-3 text-sm leading-6 text-surface-600">
              Keep the client-facing label and tracked domain accurate so portfolio reporting stays clean.
            </p>
          </div>

          {!isEditing ? (
            <button
              onClick={handleEditToggle}
              className="inline-flex items-center gap-2 rounded-2xl border border-surface-200 bg-white px-4 py-3 text-sm font-semibold text-surface-700 transition hover:border-primary-300 hover:text-primary-700"
            >
              <PencilLine className="h-4 w-4" />
              Edit client
            </button>
          ) : (
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleEditCancel}
                disabled={isSaving}
                className="inline-flex items-center gap-2 rounded-2xl border border-surface-200 bg-white px-4 py-3 text-sm font-semibold text-surface-700 transition hover:border-surface-300 disabled:opacity-60"
              >
                <X className="h-4 w-4" />
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || !hasPendingChanges}
                className="inline-flex items-center gap-2 rounded-2xl bg-primary-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {isSaving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          )}
        </div>

        {editError && (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {editError}
          </div>
        )}

        {editSuccess && !isEditing && (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {editSuccess}
          </div>
        )}

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-surface-700">Site name</label>
            {isEditing ? (
              <input
                value={editForm.name}
                onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))}
                className="mt-2 w-full rounded-2xl border border-surface-200 px-4 py-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                placeholder="Abebe Furniture"
              />
            ) : (
              <div className="mt-2 rounded-2xl border border-surface-200 bg-surface-50 px-4 py-3 text-sm text-surface-900">
                {client.name}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-700">Client domain</label>
            {isEditing ? (
              <input
                value={editForm.domain}
                onChange={(event) => setEditForm((current) => ({ ...current, domain: event.target.value }))}
                className="mt-2 w-full rounded-2xl border border-surface-200 px-4 py-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                placeholder="abebefurniture.et"
              />
            ) : (
              <div className="mt-2 rounded-2xl border border-surface-200 bg-surface-50 px-4 py-3 text-sm text-surface-900">
                {client.domain}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-[28px] border border-red-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2 text-red-700">
          <ShieldAlert className="h-5 w-5" />
          <h2 className="text-xl font-semibold">Danger zone</h2>
        </div>
        <p className="mt-3 text-sm leading-6 text-surface-600">
          Delete this client site only if it has no tracked sessions, replay data, site-linked alerts, or site-linked funnels.
        </p>

        {deleteError && (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {deleteError}
          </div>
        )}

        {deleteBlockers && (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <p className="font-semibold">Deletion is blocked until dependent data is removed or handled.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <span>Sessions: {deleteBlockers.sessions}</span>
              <span>Replay records: {deleteBlockers.replays}</span>
              <span>Site alerts: {deleteBlockers.alerts}</span>
              <span>Site funnels: {deleteBlockers.funnels}</span>
            </div>
          </div>
        )}

        {!isDeleteConfirming ? (
          <div className="mt-5">
            <button
              onClick={handleDeleteStart}
              className="inline-flex items-center gap-2 rounded-2xl bg-red-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-700"
            >
              <Trash2 className="h-4 w-4" />
              Delete client site
            </button>
          </div>
        ) : (
          <div className="mt-5 rounded-3xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-semibold text-red-800">Delete {client.name}?</p>
            <p className="mt-2 text-sm text-red-700">
              This action is only allowed when no dependent site data exists. DXM will block deletion if sessions, replay records, alerts, or funnels are still linked to this site.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                onClick={handleDeleteCancel}
                disabled={isDeleting}
                className="inline-flex items-center gap-2 rounded-2xl border border-red-200 bg-white px-4 py-3 text-sm font-semibold text-red-700 transition hover:border-red-300 disabled:opacity-60"
              >
                <X className="h-4 w-4" />
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="inline-flex items-center gap-2 rounded-2xl bg-red-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {isDeleting ? 'Deleting…' : 'Confirm delete'}
              </button>
            </div>
          </div>
        )}
      </section>

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
