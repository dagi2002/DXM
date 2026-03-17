import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Save, Send, CreditCard, Zap } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getApiUrl, fetchJson } from '../lib/api';

export const SettingsPage: React.FC = () => {
  const { t } = useTranslation();
  const { workspace } = useAuth();
  const [workspaceName, setWorkspaceName] = useState(workspace?.name || '');
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [saved, setSaved] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchJson<any>('/settings', { credentials: 'include' }).then(data => {
      if (data.name) setWorkspaceName(data.name);
      if (data.telegram_chat_id) setChatId(data.telegram_chat_id);
    }).catch(() => {});
  }, []);

  const handleSave = async () => {
    setError(null);
    try {
      await fetchJson('/settings', {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: workspaceName }),
      });
      if (botToken && chatId) {
        await fetchJson('/settings/telegram', {
          method: 'PUT', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ botToken, chatId }),
        });
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save settings');
    }
  };

  const handleTelegramTest = async () => {
    setTestStatus('sending');
    try {
      await fetchJson('/settings/telegram/test', { method: 'POST', credentials: 'include' });
      setTestStatus('ok');
    } catch {
      setTestStatus('error');
    }
    setTimeout(() => setTestStatus('idle'), 3000);
  };

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">{t('settings.title')}</h1>
      <p className="text-gray-500 text-sm mb-8">Manage your workspace preferences</p>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Workspace name */}
      <section className="bg-white rounded-xl border border-gray-100 p-6 mb-4">
        <h2 className="text-base font-semibold text-gray-900 mb-4">{t('settings.workspace')}</h2>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Workspace name</label>
          <input
            value={workspaceName}
            onChange={e => setWorkspaceName(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>
      </section>

      {/* Telegram */}
      <section className="bg-white rounded-xl border border-gray-100 p-6 mb-4">
        <div className="flex items-start gap-3 mb-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 shrink-0">
            <Send className="h-4 w-4 text-blue-600" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">{t('settings.telegram')}</h2>
            <p className="text-sm text-gray-500 mt-0.5">{t('settings.telegram.description')}</p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('settings.telegram.botToken')}</label>
            <input
              type="password" value={botToken} onChange={e => setBotToken(e.target.value)}
              placeholder="123456789:AAF..."
              className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
            <p className="text-xs text-gray-400 mt-1">Get a token from @BotFather on Telegram</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('settings.telegram.chatId')}</label>
            <input
              value={chatId} onChange={e => setChatId(e.target.value)}
              placeholder="-1001234567890"
              className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
            <p className="text-xs text-gray-400 mt-1">Forward a message to @userinfobot to get your Chat ID</p>
          </div>
          <button
            onClick={handleTelegramTest}
            disabled={testStatus === 'sending' || !chatId}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
              testStatus === 'ok' ? 'border-green-200 bg-green-50 text-green-700' :
              testStatus === 'error' ? 'border-red-200 bg-red-50 text-red-700' :
              'border-gray-200 text-gray-600 hover:bg-gray-50'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <Send className="h-3.5 w-3.5" />
            {testStatus === 'sending' ? 'Sending…' :
             testStatus === 'ok' ? '✓ Message sent!' :
             testStatus === 'error' ? '✗ Check credentials' :
             t('settings.telegram.test')}
          </button>
        </div>
      </section>

      {/* Billing shortcut */}
      <section className="bg-white rounded-xl border border-gray-100 p-6 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-50 shrink-0">
              <CreditCard className="h-4 w-4 text-green-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">{t('settings.billing')}</h2>
              <p className="text-sm text-gray-500">
                Current plan: <span className="font-medium capitalize">{workspace?.plan || 'Free'}</span>
              </p>
            </div>
          </div>
          <Link to="/settings/billing" className="text-sm font-medium text-blue-600 hover:underline">
            Manage →
          </Link>
        </div>
      </section>

      <button
        onClick={handleSave}
        className={`flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold text-white transition-colors ${
          saved ? 'bg-green-600' : 'bg-blue-600 hover:bg-blue-700'
        }`}
      >
        <Save className="h-4 w-4" />
        {saved ? t('settings.saved') : t('settings.save')}
      </button>
    </div>
  );
};
