import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Bot,
  Building2,
  CheckCircle2,
  Code2,
  Copy,
  CreditCard,
  ExternalLink,
  Globe2,
  Save,
  Send,
  Sparkles,
  Users,
  User,
  Wifi,
  X,
} from 'lucide-react';
import { UpgradeGate } from '../components/UpgradeGate';
import { useAuth } from '../context/AuthContext';
import { fetchJson } from '../lib/api';
import { BILLING_FEATURES, getPlanLabel, workspaceHasFeature } from '../lib/billing';
import {
  AGENCY_TYPE_OPTIONS,
  MANAGED_SITES_BAND_OPTIONS,
  REPORTING_WORKFLOW_OPTIONS,
  formatAgencyType,
  formatManagedSitesBand,
  formatReportingWorkflow,
  type WorkspaceFitProfile,
  type WorkspaceJourney,
} from '../lib/workspaceSignals';
import type { ClientSiteSummary } from '../types';

interface SettingsPayload {
  profile: {
    id: string;
    name: string;
    email: string;
    role: 'owner' | 'admin' | 'viewer';
    avatar?: string;
    lastLogin: string | null;
  };
  workspace: {
    id: string;
    name: string;
    plan: 'free' | 'starter' | 'pro';
    billingStatus: 'active' | 'past_due' | 'cancelled';
    telegramChatId: string | null;
    telegramConfigured: boolean;
    digestEnabled: boolean;
    digestLanguage: 'en' | 'am';
    emailNotificationsEnabled: boolean;
    createdAt: string;
  };
  team: Array<{
    id: string;
    name: string;
    email: string;
    role: 'owner' | 'admin' | 'viewer';
    avatar?: string;
    lastLogin: string | null;
  }>;
  sites: ClientSiteSummary[];
  fitProfile: WorkspaceFitProfile;
  journey: WorkspaceJourney;
}

type SettingsSection = 'identity' | 'team' | 'sites' | 'connections' | 'billing' | 'signals';

const DEFAULT_SDK_CDN_URL = 'https://cdn.dxmpulse.com/dxm.js';

const formatDateTime = (value: string | null) => {
  if (!value) return 'Never';
  return new Date(value).toLocaleString();
};

const getSnippet = (siteKey: string, sdkCdnUrl: string) =>
  `<script src="${sdkCdnUrl}" data-site-id="${siteKey}" async></script>`;

export const SettingsPage: React.FC = () => {
  const { t } = useTranslation();

  const navItems: { id: SettingsSection; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'identity', label: t('settings.nav.identity'), icon: User },
    { id: 'team', label: t('settings.nav.team'), icon: Users },
    { id: 'sites', label: t('settings.nav.sites'), icon: Globe2 },
    { id: 'connections', label: t('settings.nav.connections'), icon: Bot },
    { id: 'billing', label: t('settings.nav.billing'), icon: CreditCard },
    { id: 'signals', label: t('settings.nav.signals'), icon: CheckCircle2 },
  ];
  const { workspace: authWorkspace } = useAuth();
  const [payload, setPayload] = useState<SettingsPayload | null>(null);
  const [workspaceName, setWorkspaceName] = useState(authWorkspace?.name || '');
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [digestEnabled, setDigestEnabled] = useState(false);
  const [digestLanguage, setDigestLanguage] = useState<'en' | 'am'>('en');
  const [emailNotificationsEnabled, setEmailNotificationsEnabled] = useState(true);
  const [agencyType, setAgencyType] = useState('');
  const [managedSitesBand, setManagedSitesBand] = useState('');
  const [reportingWorkflow, setReportingWorkflow] = useState('');
  const [evaluationReason, setEvaluationReason] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [copiedSiteId, setCopiedSiteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [activeSection, setActiveSection] = useState<SettingsSection>('identity');

  const sdkCdnUrl =
    (import.meta.env.VITE_SDK_CDN_URL as string | undefined)?.trim() || DEFAULT_SDK_CDN_URL;
  const hasPaidMessaging = workspaceHasFeature(authWorkspace?.plan || 'free', BILLING_FEATURES.telegram);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const data = await fetchJson<SettingsPayload>('/settings');
      setPayload(data);
      setWorkspaceName(data.workspace.name);
      setChatId(data.workspace.telegramChatId || '');
      setDigestEnabled(Boolean(data.workspace.digestEnabled));
      setDigestLanguage(data.workspace.digestLanguage === 'am' ? 'am' : 'en');
      setEmailNotificationsEnabled(data.workspace.emailNotificationsEnabled !== false);
      setAgencyType(data.fitProfile.agencyType || '');
      setManagedSitesBand(data.fitProfile.managedSitesBand || '');
      setReportingWorkflow(data.fitProfile.reportingWorkflow || '');
      setEvaluationReason(data.fitProfile.evaluationReason || '');
      setIsDirty(false);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load settings');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  const siteCountCopy = useMemo(() => {
    const count = payload?.sites.length || 0;
    return `${count} client site${count === 1 ? '' : 's'} connected`;
  }, [payload?.sites.length]);

  const handleCopySnippet = async (site: ClientSiteSummary) => {
    await navigator.clipboard.writeText(getSnippet(site.siteKey, sdkCdnUrl));
    setCopiedSiteId(site.id);
    window.setTimeout(() => setCopiedSiteId(null), 1500);
  };

  const markDirty = () => setIsDirty(true);

  const handleDiscard = async () => {
    await loadSettings();
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    try {
      await fetchJson('/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          hasPaidMessaging
            ? {
                name: workspaceName,
                agencyType: agencyType || null,
                managedSitesBand: managedSitesBand || null,
                reportingWorkflow: reportingWorkflow || null,
                evaluationReason: evaluationReason.trim() || null,
                digestEnabled,
                digestLanguage,
                emailNotificationsEnabled,
              }
            : {
                name: workspaceName,
                agencyType: agencyType || null,
                managedSitesBand: managedSitesBand || null,
                reportingWorkflow: reportingWorkflow || null,
                evaluationReason: evaluationReason.trim() || null,
                emailNotificationsEnabled,
              },
        ),
      });

      if (hasPaidMessaging && botToken.trim() && chatId.trim()) {
        await fetchJson('/settings/telegram', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            botToken: botToken.trim(),
            chatId: chatId.trim(),
          }),
        });
        setBotToken('');
      }

      setSaved(true);
      setIsDirty(false);
      window.setTimeout(() => setSaved(false), 2000);
      await loadSettings();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTelegramTest = async () => {
    setTesting(true);
    setError(null);
    try {
      await fetchJson('/settings/telegram/test', { method: 'POST' });
      await loadSettings();
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : 'Telegram test failed');
    } finally {
      setTesting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl p-6 md:p-8">
        <div className="rounded-[28px] border border-surface-200 bg-white p-12 text-center shadow-sm">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
          <p className="mt-4 text-sm text-surface-500">Loading workspace settings…</p>
        </div>
      </div>
    );
  }

  if (error && !payload) {
    return (
      <div className="mx-auto max-w-7xl p-6 md:p-8">
        <div className="rounded-[28px] border border-red-200 bg-red-50 p-10 text-center text-red-700">
          {error}
        </div>
      </div>
    );
  }

  if (!payload) return null;

  const activationSteps = [
    { label: 'First live site', value: payload.journey.firstSiteLiveAt },
    { label: 'First replay reviewed', value: payload.journey.firstReplayViewedAt },
    { label: 'First alert reviewed', value: payload.journey.firstAlertReviewedAt },
    { label: 'First report exported', value: payload.journey.firstReportExportedAt },
    { label: 'First upgrade request', value: payload.journey.firstUpgradeRequestAt },
  ];

  const inputClass =
    'w-full rounded-2xl border border-surface-200 px-4 py-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100';

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-6">

      {/* ── Sticky unsaved-changes bar ─────────────────────────────── */}
      {isDirty && (
        <div className="sticky top-0 z-40 -mx-4 mb-4 flex items-center justify-between border-b border-amber-200 bg-amber-50 px-6 py-3 shadow-sm md:-mx-6">
          <span className="flex items-center gap-2 text-sm font-medium text-amber-800">
            <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
            Unsaved changes
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void handleDiscard()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-700 transition hover:bg-amber-50"
            >
              <X className="h-3.5 w-3.5" />
              Discard
            </button>
            <button
              onClick={() => void handleSave()}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-primary-700 disabled:opacity-60"
            >
              <Save className="h-3.5 w-3.5" />
              {saved ? t('settings.saved') : isSaving ? 'Saving…' : t('settings.save')}
            </button>
          </div>
        </div>
      )}

      {/* ── Page header ────────────────────────────────────────────── */}
      <div className="mb-6 rounded-[28px] border border-primary-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary-700">
              <Sparkles className="h-3.5 w-3.5" />
              Settings
            </div>
            <h1 className="mt-2 text-2xl font-bold text-surface-900">{t('settings.title')}</h1>
            <p className="mt-1 text-sm text-surface-500">
              {t('settings.subtitle')}
            </p>
          </div>
          {!isDirty && (
            <button
              onClick={() => void handleSave()}
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-2xl bg-primary-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {saved ? t('settings.saved') : isSaving ? 'Saving…' : t('settings.save')}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── Sidebar + content layout ───────────────────────────────── */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">

        {/* Sidebar nav */}
        <nav className="flex shrink-0 flex-row gap-1 overflow-x-auto rounded-[20px] border border-surface-200 bg-white p-2 shadow-sm lg:w-52 lg:flex-col">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveSection(id)}
              className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-all whitespace-nowrap ${
                activeSection === id
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-surface-600 hover:bg-surface-50 hover:text-surface-900'
              }`}
            >
              <Icon className={`h-4 w-4 shrink-0 ${activeSection === id ? 'text-primary-600' : 'text-surface-400'}`} />
              {label}
            </button>
          ))}
        </nav>

        {/* Content panel */}
        <div className="min-w-0 flex-1 space-y-6">

          {/* ── IDENTITY ─────────────────────────────────────────── */}
          {activeSection === 'identity' && (
            <>
              <section className="rounded-[28px] border border-surface-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-3">
                  {payload.profile.avatar ? (
                    <img src={payload.profile.avatar} alt={payload.profile.name} className="h-14 w-14 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-100 text-lg font-semibold text-primary-700">
                      {payload.profile.name.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-surface-500">Profile</p>
                    <h2 className="mt-1 text-xl font-semibold text-surface-900">{payload.profile.name}</h2>
                    <p className="text-sm text-surface-500">{payload.profile.email}</p>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-3">
                  <div className="rounded-3xl bg-surface-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-surface-500">Role</p>
                    <p className="mt-2 text-lg font-semibold capitalize text-surface-900">{payload.profile.role}</p>
                  </div>
                  <div className="rounded-3xl bg-surface-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-surface-500">Workspace</p>
                    <p className="mt-2 text-lg font-semibold text-surface-900">{payload.workspace.name}</p>
                  </div>
                  <div className="rounded-3xl bg-surface-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-surface-500">Last login</p>
                    <p className="mt-2 text-sm font-medium text-surface-900">{formatDateTime(payload.profile.lastLogin)}</p>
                  </div>
                </div>
              </section>

              <section className="rounded-[28px] border border-primary-200 bg-gradient-to-br from-primary-50 to-accent-50 p-6 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-700">Workspace posture</p>
                <h2 className="mt-3 text-2xl font-semibold text-surface-900">{getPlanLabel(payload.workspace.plan)}</h2>
                <p className="mt-2 text-sm leading-6 text-surface-600">
                  {siteCountCopy}, {payload.team.length} team member{payload.team.length === 1 ? '' : 's'}, billing status is{' '}
                  <span className="font-semibold capitalize">{payload.workspace.billingStatus}</span>.
                </p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-3xl border border-white/60 bg-white/70 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-surface-500">Digest</p>
                    <p className="mt-2 text-lg font-semibold text-surface-900">{payload.workspace.digestEnabled ? 'Enabled' : 'Off'}</p>
                  </div>
                  <div className="rounded-3xl border border-white/60 bg-white/70 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-surface-500">Telegram</p>
                    <p className="mt-2 text-lg font-semibold text-surface-900">{payload.workspace.telegramConfigured ? 'Connected' : 'Not configured'}</p>
                  </div>
                </div>
              </section>
            </>
          )}

          {/* ── TEAM ─────────────────────────────────────────────── */}
          {activeSection === 'team' && (
            <section className="rounded-[28px] border border-surface-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2 text-surface-900">
                <Users className="h-5 w-5 text-primary-600" />
                <h2 className="text-xl font-semibold">{t('settings.section.team')}</h2>
              </div>

              <div className="mt-5">
                <label className="mb-2 block text-sm font-medium text-surface-700">{t('settings.workspaceName')}</label>
                <input
                  value={workspaceName}
                  onChange={(e) => { setWorkspaceName(e.target.value); markDirty(); }}
                  className={inputClass}
                />
              </div>

              <div className="mt-5 rounded-3xl border border-surface-200 bg-surface-50 p-4">
                <label className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-surface-900">Email notifications</p>
                    <p className="mt-1 text-sm text-surface-500">Receive welcome, site-verified, and critical alert emails.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={emailNotificationsEnabled}
                    onChange={(e) => { setEmailNotificationsEnabled(e.target.checked); markDirty(); }}
                    className="h-5 w-5 rounded border-surface-300 text-primary-600 focus:ring-primary-500"
                  />
                </label>
              </div>

              <div className="mt-6 space-y-3">
                {payload.team.map((member) => (
                  <div key={member.id} className="flex items-center justify-between gap-3 rounded-3xl border border-surface-200 bg-surface-50 px-4 py-4">
                    <div>
                      <p className="text-sm font-semibold text-surface-900">{member.name}</p>
                      <p className="mt-1 text-sm text-surface-500">{member.email}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-surface-500">{member.role}</p>
                      <p className="mt-1 text-xs text-surface-500">{formatDateTime(member.lastLogin)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── SITES ────────────────────────────────────────────── */}
          {activeSection === 'sites' && (
            <section className="rounded-[28px] border border-surface-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2 text-surface-900">
                <Building2 className="h-5 w-5 text-primary-600" />
                <h2 className="text-xl font-semibold">{t('settings.section.sites')}</h2>
              </div>

              <div className="mt-5 space-y-4">
                {payload.sites.length === 0 && (
                  <div className="rounded-3xl border border-dashed border-surface-200 bg-surface-50 p-6 text-sm text-surface-500">
                    {t('settings.sites.emptyTitle')}
                  </div>
                )}
                {payload.sites.map((site) => (
                  <div key={site.id} className="rounded-3xl border border-surface-200 bg-surface-50 p-5">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-lg font-semibold text-surface-900">{site.name}</p>
                        <p className="mt-1 text-sm text-surface-500">{site.domain}</p>
                        <p className="mt-3 text-sm text-surface-600">
                          {site.verified ? t('settings.sites.verified') : t('settings.sites.awaiting')} · {t('settings.sites.recentSessions', { count: site.sessionCount7d })}
                        </p>
                      </div>
                      <button
                        onClick={() => void handleCopySnippet(site)}
                        className="inline-flex items-center gap-2 rounded-2xl border border-surface-200 bg-white px-4 py-3 text-sm font-semibold text-surface-700 transition hover:border-primary-300 hover:text-primary-700"
                      >
                        <Copy className="h-4 w-4" />
                        {copiedSiteId === site.id ? t('settings.copied') : t('settings.sites.copySnippet')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── CONNECTIONS ──────────────────────────────────────── */}
          {activeSection === 'connections' && (
            <>
              <section className="rounded-[28px] border border-surface-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-2 text-surface-900">
                  <Bot className="h-5 w-5 text-primary-600" />
                  <h2 className="text-xl font-semibold">{t('settings.section.connections')}</h2>
                </div>

                {hasPaidMessaging ? (
                  <div className="mt-5 grid gap-4">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-surface-700">{t('settings.telegram.botToken')}</label>
                      <input
                        value={botToken}
                        onChange={(e) => { setBotToken(e.target.value); markDirty(); }}
                        placeholder={payload.workspace.telegramConfigured ? 'Saved. Paste a new token to replace it.' : 'Paste your Telegram bot token'}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-surface-700">{t('settings.telegram.chatId')}</label>
                      <input
                        value={chatId}
                        onChange={(e) => { setChatId(e.target.value); markDirty(); }}
                        placeholder="Your Telegram chat or channel ID"
                        className={inputClass}
                      />
                    </div>
                    <div className="rounded-3xl border border-surface-200 bg-surface-50 p-4">
                      <label className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-surface-900">{t('settings.digest.enable')}</p>
                          <p className="mt-1 text-sm text-surface-500">{t('settings.digest.enableHelp')}</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={digestEnabled}
                          onChange={(e) => { setDigestEnabled(e.target.checked); markDirty(); }}
                          className="h-5 w-5 rounded border-surface-300 text-primary-600 focus:ring-primary-500"
                        />
                      </label>
                      <div className="mt-4">
                        <label className="mb-2 block text-sm font-medium text-surface-700">{t('settings.digest.language')}</label>
                        <select
                          value={digestLanguage}
                          onChange={(e) => { setDigestLanguage(e.target.value as 'en' | 'am'); markDirty(); }}
                          className={inputClass}
                        >
                          <option value="en">{t('settings.digest.languageEnglish')}</option>
                          <option value="am">{t('settings.digest.languageAmharic')}</option>
                        </select>
                      </div>
                    </div>
                    <button
                      onClick={() => void handleTelegramTest()}
                      disabled={testing || !payload.workspace.telegramConfigured}
                      className="inline-flex items-center gap-2 rounded-2xl border border-surface-200 px-4 py-3 text-sm font-semibold text-surface-700 transition hover:border-primary-300 hover:text-primary-700 disabled:opacity-60"
                    >
                      <Send className="h-4 w-4" />
                      {testing ? t('settings.telegram.sending') : t('settings.telegram.test')}
                    </button>
                  </div>
                ) : (
                  <div className="mt-5">
                    <UpgradeGate
                      source="telegram"
                      title="Unlock Telegram alerts and weekly digests when DXM becomes part of your operating rhythm."
                      description="These delivery features are gated with the paid bundle because they turn DXM from a dashboard you open into a system that actively pushes issues and summaries to the team."
                      bullets={[
                        'Telegram alert delivery for urgent issues',
                        'Weekly digest for founders and operators',
                      ]}
                    />
                  </div>
                )}
              </section>

              <section className="rounded-[28px] border border-surface-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-2 text-surface-900">
                  <Globe2 className="h-5 w-5 text-primary-600" />
                  <h2 className="text-xl font-semibold">Integrations</h2>
                </div>
                <div className="mt-5 space-y-3">
                  {[
                    {
                      icon: <Code2 className="h-4 w-4 text-primary-600" />,
                      title: 'Tracking SDK',
                      detail: `${payload.sites.length} site snippet${payload.sites.length === 1 ? '' : 's'} ready for install`,
                    },
                    {
                      icon: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
                      title: 'Telegram',
                      detail: payload.workspace.telegramConfigured
                        ? 'Configured and ready for alert delivery'
                        : 'Connect a bot token and chat ID above',
                    },
                    {
                      icon: <Wifi className="h-4 w-4 text-accent-600" />,
                      title: 'DXM Pulse AI',
                      detail: 'LLM-powered briefs on overview, alerts, funnels, and reports',
                    },
                    {
                      icon: <ExternalLink className="h-4 w-4 text-surface-400" />,
                      title: 'Webhooks',
                      detail: 'Coming soon — push DXM events to Slack, Jira, or custom endpoints',
                    },
                  ].map((integration) => (
                    <div key={integration.title} className="flex items-start gap-3 rounded-3xl border border-surface-200 bg-surface-50 p-4">
                      <div className="mt-1">{integration.icon}</div>
                      <div>
                        <p className="text-sm font-semibold text-surface-900">{integration.title}</p>
                        <p className="mt-1 text-sm text-surface-600">{integration.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}

          {/* ── BILLING ──────────────────────────────────────────── */}
          {activeSection === 'billing' && (
            <section className="rounded-[28px] border border-surface-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2 text-surface-900">
                <CreditCard className="h-5 w-5 text-primary-600" />
                <h2 className="text-xl font-semibold">Billing</h2>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                <div className="rounded-3xl bg-surface-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-surface-500">Current plan</p>
                  <p className="mt-2 text-lg font-semibold text-surface-900">{getPlanLabel(payload.workspace.plan)}</p>
                </div>
                <div className="rounded-3xl bg-surface-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-surface-500">Billing status</p>
                  <p className="mt-2 text-lg font-semibold capitalize text-surface-900">{payload.workspace.billingStatus}</p>
                </div>
                <div className="rounded-3xl bg-surface-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-surface-500">Sites connected</p>
                  <p className="mt-2 text-lg font-semibold text-surface-900">{payload.sites.length}</p>
                </div>
              </div>

              <p className="mt-5 text-sm leading-6 text-surface-600">
                Billing stays honest in this milestone. Chapa automation is not fully live yet, so upgrades are manual and explicit.
              </p>
              <Link
                to="/settings/billing"
                className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-primary-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary-700"
              >
                Open billing
              </Link>
            </section>
          )}

          {/* ── SIGNALS ──────────────────────────────────────────── */}
          {activeSection === 'signals' && (
            <>
              <section className="rounded-[28px] border border-surface-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-2 text-surface-900">
                  <Sparkles className="h-5 w-5 text-primary-600" />
                  <h2 className="text-xl font-semibold">Agency fit profile</h2>
                </div>

                <p className="mt-3 text-sm leading-6 text-surface-600">
                  Helps DXM learn which agency setups convert and stick without turning onboarding into a survey.
                </p>

                <div className="mt-5 grid gap-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-surface-700">Agency type</label>
                    <select
                      value={agencyType}
                      onChange={(e) => { setAgencyType(e.target.value); markDirty(); }}
                      className={inputClass}
                    >
                      <option value="">Select one</option>
                      {AGENCY_TYPE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-surface-700">Managed client sites</label>
                    <select
                      value={managedSitesBand}
                      onChange={(e) => { setManagedSitesBand(e.target.value); markDirty(); }}
                      className={inputClass}
                    >
                      <option value="">Select one</option>
                      {MANAGED_SITES_BAND_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-surface-700">Current reporting workflow</label>
                    <select
                      value={reportingWorkflow}
                      onChange={(e) => { setReportingWorkflow(e.target.value); markDirty(); }}
                      className={inputClass}
                    >
                      <option value="">Select one</option>
                      {REPORTING_WORKFLOW_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-surface-700">Why you are evaluating DXM</label>
                    <input
                      value={evaluationReason}
                      onChange={(e) => { setEvaluationReason(e.target.value); markDirty(); }}
                      placeholder="Example: we need cleaner client reports and faster issue detection"
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-3xl bg-surface-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-surface-500">Type</p>
                    <p className="mt-2 text-sm font-semibold text-surface-900">{formatAgencyType(payload.fitProfile.agencyType)}</p>
                  </div>
                  <div className="rounded-3xl bg-surface-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-surface-500">Managed sites</p>
                    <p className="mt-2 text-sm font-semibold text-surface-900">{formatManagedSitesBand(payload.fitProfile.managedSitesBand)}</p>
                  </div>
                  <div className="rounded-3xl bg-surface-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-surface-500">Reporting flow</p>
                    <p className="mt-2 text-sm font-semibold text-surface-900">{formatReportingWorkflow(payload.fitProfile.reportingWorkflow)}</p>
                  </div>
                </div>
              </section>

              <section className="rounded-[28px] border border-surface-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-2 text-surface-900">
                  <CheckCircle2 className="h-5 w-5 text-primary-600" />
                  <h2 className="text-xl font-semibold">Activation signals</h2>
                </div>
                <p className="mt-3 text-sm leading-6 text-surface-600">
                  These milestones show whether the workspace is moving from setup into real client-facing value.
                </p>
                <div className="mt-5 space-y-3">
                  {activationSteps.map((step) => (
                    <div key={step.label} className="flex items-center justify-between gap-4 rounded-3xl border border-surface-200 bg-surface-50 px-4 py-4">
                      <div>
                        <p className="text-sm font-semibold text-surface-900">{step.label}</p>
                        <p className="mt-1 text-xs text-surface-500">
                          {step.value ? formatDateTime(step.value) : 'Not completed yet'}
                        </p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${step.value ? 'bg-emerald-100 text-emerald-700' : 'bg-surface-200 text-surface-500'}`}>
                        {step.value ? 'Done' : 'Pending'}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}

        </div>
      </div>
    </div>
  );
};
