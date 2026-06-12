/**
 * TeamPanel — invite form + pending invites list for Settings → Team.
 *
 * Owners/admins invite teammates by email with a role (admin/viewer). The
 * invite link travels only via email; this panel just shows pending invites
 * and lets them be revoked. Viewers don't see this panel at all.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Mail, Send, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { fetchJson } from '../../lib/api';

interface InviteView {
  id: string;
  email: string;
  role: 'admin' | 'viewer';
  expiresAt: string;
  createdAt: string;
}

interface Props {
  canManage: boolean;
}

export const TeamPanel: React.FC<Props> = ({ canManage }) => {
  const { t } = useTranslation();
  const [invites, setInvites] = useState<InviteView[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'viewer'>('viewer');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const loadInvites = useCallback(async () => {
    try {
      const res = await fetchJson<{ invites: InviteView[] }>('/users/invites');
      setInvites(res.invites || []);
    } catch {
      /* viewers get 403; the panel is hidden for them anyway */
    }
  }, []);

  useEffect(() => {
    if (canManage) void loadInvites();
  }, [canManage, loadInvites]);

  if (!canManage) return null;

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || sending) return;
    setSending(true);
    setError(null);
    setSentTo(null);
    try {
      await fetchJson('/users/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      setSentTo(email.trim());
      setEmail('');
      await loadInvites();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.team.inviteFailed'));
    } finally {
      setSending(false);
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      await fetchJson(`/users/invites/${id}/revoke`, { method: 'POST' });
      await loadInvites();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.team.revokeFailed'));
    }
  };

  return (
    <div className="mt-6 rounded-3xl border border-surface-200 bg-surface-50 p-5">
      <div className="flex items-center gap-2">
        <Mail className="h-4 w-4 text-primary-600" />
        <h3 className="text-sm font-semibold text-surface-900">{t('settings.team.inviteTitle')}</h3>
      </div>
      <p className="mt-1 text-sm text-surface-500">{t('settings.team.inviteHelp')}</p>

      <form onSubmit={handleInvite} className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t('settings.team.emailPlaceholder')}
          required
          className="flex-1 rounded-2xl border border-surface-200 bg-white px-4 py-3 text-sm text-surface-900 placeholder:text-surface-400 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value === 'admin' ? 'admin' : 'viewer')}
          className="rounded-2xl border border-surface-200 bg-white px-4 py-3 text-sm text-surface-900 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
        >
          <option value="viewer">{t('settings.team.roleViewer')}</option>
          <option value="admin">{t('settings.team.roleAdmin')}</option>
        </select>
        <button
          type="submit"
          disabled={!email.trim() || sending}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:opacity-60"
        >
          <Send className="h-4 w-4" />
          {sending ? t('settings.team.sending') : t('settings.team.sendInvite')}
        </button>
      </form>

      {sentTo && (
        <p className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {t('settings.team.inviteSent', { email: sentTo })}
        </p>
      )}
      {error && (
        <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {invites.length > 0 && (
        <div className="mt-5">
          <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-surface-500">
            {t('settings.team.pendingTitle', { count: invites.length })}
          </h4>
          <ul className="mt-3 space-y-2">
            {invites.map((invite) => (
              <li
                key={invite.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-surface-200 bg-white px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-surface-900">{invite.email}</p>
                  <p className="mt-0.5 text-xs text-surface-500">
                    {invite.role === 'admin' ? t('settings.team.roleAdmin') : t('settings.team.roleViewer')}
                    {' · '}
                    {t('settings.team.expires', { date: new Date(invite.expiresAt + 'Z').toLocaleDateString() })}
                  </p>
                </div>
                <button
                  onClick={() => void handleRevoke(invite.id)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-surface-200 bg-white px-3 py-1.5 text-xs font-semibold text-surface-600 transition hover:border-red-300 hover:text-red-700"
                >
                  <X className="h-3.5 w-3.5" />
                  {t('settings.team.revoke')}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default TeamPanel;
