/**
 * AcceptInvitePage — public landing for workspace invite links
 * (/accept-invite?token=…). Previews the invite (email, role, workspace),
 * collects name + password, and logs the new member straight in.
 */
import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Zap, Eye, EyeOff, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { fetchJson } from '../lib/api';
import { useAuth } from '../context/useAuth';

interface InvitePreview {
  email: string;
  role: 'admin' | 'viewer';
  workspaceName: string;
  valid: boolean;
}

export const AcceptInvitePage: React.FC = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const { refreshUser } = useAuth();

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setPreviewError(t('acceptInvite.invalidLink'));
      return;
    }
    fetchJson<InvitePreview>(`auth/invites/${encodeURIComponent(token)}`)
      .then(setPreview)
      .catch(() => setPreviewError(t('acceptInvite.expiredOrUsed')));
  }, [token, t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!token) return;
    if (password.length < 8) {
      setError(t('acceptInvite.passwordTooShort'));
      return;
    }

    setIsLoading(true);
    try {
      await fetchJson('auth/invites/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name, password }),
      });
      await refreshUser();
      navigate('/overview', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('acceptInvite.acceptFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-50 items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <div className="flex items-center gap-2 mb-8 justify-center">
          <Zap className="h-7 w-7 text-primary-600" />
          <span className="text-xl font-bold text-gray-900">DXM Pulse</span>
        </div>

        {previewError ? (
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('acceptInvite.invalidTitle')}</h1>
            <p className="text-gray-500 mb-6">{previewError}</p>
            <button
              onClick={() => navigate('/login')}
              className="rounded-lg bg-primary-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-primary-700"
            >
              {t('acceptInvite.goToLogin')}
            </button>
          </div>
        ) : !preview ? (
          <div className="flex justify-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-gray-900 mb-2 text-center">
              {t('acceptInvite.title', { workspace: preview.workspaceName })}
            </h1>
            <p className="text-gray-500 mb-6 text-center">
              {t('acceptInvite.subtitle', {
                role: preview.role === 'admin' ? t('acceptInvite.roleAdmin') : t('acceptInvite.roleViewer'),
              })}
            </p>

            <div className="mb-6 flex items-center gap-3 rounded-lg border border-primary-100 bg-primary-50 px-4 py-3">
              <Users className="h-5 w-5 text-primary-600 shrink-0" />
              <div className="text-sm text-primary-900">{preview.email}</div>
            </div>

            {error && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t('acceptInvite.nameLabel')}
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  minLength={2}
                  maxLength={80}
                  className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                  placeholder={t('acceptInvite.namePlaceholder')}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t('acceptInvite.passwordLabel')}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full rounded-lg border border-gray-200 px-4 py-3 pr-11 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full rounded-lg bg-primary-600 py-3 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed mt-2"
              >
                {isLoading ? t('acceptInvite.joining') : t('acceptInvite.joinButton')}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
