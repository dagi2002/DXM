/**
 * API Keys panel — lives in Settings → Connections.
 *
 * Users issue long-lived bearer tokens here for the MCP endpoint (so Claude
 * Desktop / Cursor can query their workspace). The raw key is shown exactly
 * once after creation — after that only the 12-char prefix is surfaced.
 *
 * Design notes:
 *   - Non-owners/admins see the list read-only (generate/revoke hidden).
 *   - Revocation is synchronous server-side, so after POST we just refetch.
 *   - Claude Desktop config snippet is inline so users don't have to leave
 *     the screen to wire it up.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Key, RefreshCw, Trash2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { fetchJson } from '../../lib/api';

interface ApiKeyView {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

interface ListResponse {
  keys: ApiKeyView[];
}

interface CreateResponse {
  key: ApiKeyView | null;
  rawKey: string;
}

interface Props {
  canManage: boolean; // false for viewers — hides generate/revoke
  apiBase: string;    // e.g. https://api.dxmpulse.com (for the config snippet)
}

const formatWhen = (iso: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
};

export const ApiKeysPanel: React.FC<Props> = ({ canManage, apiBase }) => {
  const { t } = useTranslation();
  const [keys, setKeys] = useState<ApiKeyView[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [justCreatedRaw, setJustCreatedRaw] = useState<string | null>(null);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  const mcpUrl = useMemo(() => {
    // If the API base ends with /api we keep it; otherwise append /mcp on the
    // same host. Dev defaults to localhost:3000.
    const base = apiBase || (typeof window !== 'undefined' ? window.location.origin : '');
    return `${base.replace(/\/$/, '')}/mcp`;
  }, [apiBase]);

  const loadKeys = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchJson<ListResponse>('/api-keys');
      setKeys(res.keys || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settings.apiKeys.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadKeys();
  }, [loadKeys]);

  const handleCreate = async () => {
    if (!newName.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetchJson<CreateResponse>('/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      setJustCreatedRaw(res.rawKey);
      setNewName('');
      await loadKeys();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settings.apiKeys.createError'));
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    // No confirm() — the button label already says "Revoke" and the action
    // is reversible only by creating a new key, which the UI makes clear.
    try {
      await fetchJson(`/api-keys/${id}/revoke`, { method: 'POST' });
      await loadKeys();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settings.apiKeys.revokeError'));
    }
  };

  // Generic clipboard helper — each caller passes its own "set flag on, then
  // clear after 2s" pair so we don't have to thread type-specific setter types.
  const copyWithFeedback = async (text: string, onCopied: () => void, onCleared: () => void) => {
    try {
      await navigator.clipboard.writeText(text);
      onCopied();
      setTimeout(onCleared, 2000);
    } catch {
      /* ignore clipboard errors — user can select manually */
    }
  };

  const configSnippet = useMemo(
    () =>
      JSON.stringify(
        {
          mcpServers: {
            'dxm-pulse': {
              url: mcpUrl,
              headers: { Authorization: 'Bearer <paste-your-key>' },
            },
          },
        },
        null,
        2,
      ),
    [mcpUrl],
  );

  return (
    <section className="rounded-[28px] border border-surface-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2 text-surface-900">
        <Key className="h-5 w-5 text-primary-600" />
        <h2 className="text-xl font-semibold">{t('settings.apiKeys.title')}</h2>
      </div>
      <p className="mt-2 text-sm leading-6 text-surface-600">
        {t('settings.apiKeys.description')}
      </p>

      {/* ── One-time secret reveal ───────────────────────────────────── */}
      {justCreatedRaw && (
        <div className="mt-5 rounded-3xl border border-amber-300 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-amber-900">
                {t('settings.apiKeys.oneTimeWarning')}
              </p>
              <div className="mt-3 flex items-center gap-2">
                <code className="flex-1 overflow-x-auto rounded-xl bg-white px-3 py-2 font-mono text-xs text-surface-900">
                  {justCreatedRaw}
                </code>
                <button
                  onClick={() =>
                    void copyWithFeedback(
                      justCreatedRaw,
                      () => setCopiedKeyId('new'),
                      () => setCopiedKeyId(null),
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400 bg-white px-3 py-2 text-xs font-semibold text-amber-900 transition hover:bg-amber-100"
                >
                  {copiedKeyId === 'new' ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {t('settings.apiKeys.copied')}
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      {t('settings.apiKeys.copy')}
                    </>
                  )}
                </button>
              </div>
              <button
                onClick={() => setJustCreatedRaw(null)}
                className="mt-3 text-xs font-semibold text-amber-800 underline-offset-2 hover:underline"
              >
                {t('settings.apiKeys.dismiss')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Generate row (admins only) ───────────────────────────────── */}
      {canManage && (
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t('settings.apiKeys.namePlaceholder')}
            maxLength={80}
            className="flex-1 rounded-2xl border border-surface-200 bg-white px-4 py-3 text-sm text-surface-900 placeholder:text-surface-400 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
          />
          <button
            onClick={() => void handleCreate()}
            disabled={!newName.trim() || creating}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:opacity-60"
          >
            {creating ? t('settings.apiKeys.generating') : t('settings.apiKeys.generate')}
          </button>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── Key list ─────────────────────────────────────────────────── */}
      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-surface-900">
            {t('settings.apiKeys.activeKeys', { count: keys.filter((k) => !k.revokedAt).length })}
          </h3>
          <button
            onClick={() => void loadKeys()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-full border border-surface-200 px-3 py-1 text-xs font-semibold text-surface-600 transition hover:border-primary-300 hover:text-primary-700 disabled:opacity-60"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            {t('settings.apiKeys.refresh')}
          </button>
        </div>

        {loading && keys.length === 0 ? (
          <p className="text-sm text-surface-500">{t('common.loading')}</p>
        ) : keys.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-surface-200 bg-surface-50 px-4 py-6 text-center text-sm text-surface-500">
            {t('settings.apiKeys.empty')}
          </p>
        ) : (
          <ul className="space-y-2">
            {keys.map((k) => {
              const isRevoked = Boolean(k.revokedAt);
              return (
                <li
                  key={k.id}
                  className={`flex flex-col gap-2 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${
                    isRevoked
                      ? 'border-surface-200 bg-surface-50 opacity-70'
                      : 'border-surface-200 bg-white'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-surface-900">{k.name}</p>
                      {isRevoked && (
                        <span className="rounded-full bg-surface-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-surface-600">
                          {t('settings.apiKeys.revokedBadge')}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 font-mono text-xs text-surface-500">{k.prefix}…</p>
                    <p className="mt-1 text-xs text-surface-500">
                      {t('settings.apiKeys.created')} {formatWhen(k.createdAt)} · {t('settings.apiKeys.lastUsed')} {formatWhen(k.lastUsedAt)}
                      {isRevoked ? ` · ${t('settings.apiKeys.revokedBadge')} ${formatWhen(k.revokedAt)}` : ''}
                    </p>
                  </div>
                  {canManage && !isRevoked && (
                    <button
                      onClick={() => void handleRevoke(k.id)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 transition hover:border-red-300 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {t('settings.apiKeys.revoke')}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── Claude Desktop snippet ───────────────────────────────────── */}
      <div className="mt-6 rounded-3xl border border-surface-200 bg-surface-50 p-4">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-sm font-semibold text-surface-900">{t('settings.apiKeys.configTitle')}</h4>
          <button
            onClick={() =>
              void copyWithFeedback(
                configSnippet,
                () => setCopiedSnippet(true),
                () => setCopiedSnippet(false),
              )
            }
            className="inline-flex items-center gap-1.5 rounded-xl border border-surface-200 bg-white px-3 py-1.5 text-xs font-semibold text-surface-700 transition hover:border-primary-300 hover:text-primary-700"
          >
            {copiedSnippet ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" />
                {t('settings.apiKeys.copied')}
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                {t('settings.apiKeys.copy')}
              </>
            )}
          </button>
        </div>
        <p className="mt-1 text-xs text-surface-500">
          {t('settings.apiKeys.configHelpBefore')} <code className="rounded bg-white px-1 py-0.5 font-mono">claude_desktop_config.json</code>
          {t('settings.apiKeys.configHelpAfter')}
        </p>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-white p-3 font-mono text-xs leading-relaxed text-surface-900">
          {configSnippet}
        </pre>
      </div>
    </section>
  );
};

export default ApiKeysPanel;
