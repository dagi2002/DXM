import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle, Copy, ArrowRight, Zap, Loader2 } from 'lucide-react';
import { getApiUrl } from '../lib/api';

type Step = 1 | 2 | 3;

interface SiteInfo {
  siteId: string;
  siteKey: string;
  snippet: string;
}

export const OnboardingPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [domain, setDomain] = useState('');
  const [siteName, setSiteName] = useState('');
  const [site, setSite] = useState<SiteInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [verified, setVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Poll for verification in step 3
  useEffect(() => {
    if (step !== 3 || !site || verified) return;
    setVerifying(true);
    const poll = async () => {
      try {
        const res = await fetch(getApiUrl(`/onboarding/sites/${site.siteId}/verify`), { credentials: 'include' });
        const data = await res.json();
        if (data.verified) { setVerified(true); setVerifying(false); }
      } catch {}
    };
    void poll();
    const id = setInterval(poll, 3000);
    const timeout = setTimeout(() => clearInterval(id), 3 * 60 * 1000); // 3 min max
    return () => { clearInterval(id); clearTimeout(timeout); };
  }, [step, site, verified]);

  const handleAddSite = async () => {
    if (!domain || !siteName) return;
    setError(null);
    try {
      const res = await fetch(getApiUrl('/onboarding/sites'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: siteName, domain }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Failed to create site'); }
      const data = await res.json();
      setSite(data);
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create site');
    }
  };

  const copySnippet = () => {
    if (!site) return;
    navigator.clipboard.writeText(site.snippet).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center gap-2 mb-8">
          <Zap className="h-7 w-7 text-primary-600" />
          <span className="text-xl font-bold text-gray-900">DXM Pulse</span>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-8">
          {[1, 2, 3].map(s => (
            <React.Fragment key={s}>
              <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                step > s ? 'bg-green-500 text-white' :
                step === s ? 'bg-primary-600 text-white' :
                'bg-gray-200 text-gray-400'
              }`}>
                {step > s ? <CheckCircle className="h-4 w-4" /> : s}
              </div>
              {s < 3 && <div className={`flex-1 h-0.5 ${step > s ? 'bg-green-500' : 'bg-gray-200'}`} />}
            </React.Fragment>
          ))}
        </div>

        {/* Step 2: Add site */}
        {step === 2 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
            <h2 className="text-xl font-bold text-gray-900 mb-1">{t('onboarding.step2.title')}</h2>
            <p className="text-gray-500 text-sm mb-6">{t('onboarding.step2.subtitle')}</p>
            {error && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
            )}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Site name</label>
                <input
                  value={siteName} onChange={e => setSiteName(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                  placeholder="My Online Store"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('onboarding.step2.domain')}</label>
                <input
                  value={domain} onChange={e => setDomain(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                  placeholder="mystore.et"
                />
              </div>
              <button
                onClick={handleAddSite}
                disabled={!domain || !siteName}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary-600 py-3 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Generate install snippet <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Install + verify */}
        {step === 3 && site && (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
            <h2 className="text-xl font-bold text-gray-900 mb-1">{t('onboarding.step3.title')}</h2>
            <p className="text-gray-500 text-sm mb-6">{t('onboarding.step3.subtitle')}</p>

            <p className="text-sm font-medium text-gray-700 mb-2">{t('onboarding.step2.snippet')}</p>
            <div className="relative mb-4">
              <pre className="rounded-lg bg-gray-900 p-4 text-xs text-green-400 overflow-x-auto whitespace-pre-wrap break-all">
                {site.snippet}
              </pre>
              <button
                onClick={copySnippet}
                className="absolute top-2 right-2 flex items-center gap-1.5 rounded-md bg-gray-700 px-3 py-1.5 text-xs text-white hover:bg-gray-600"
              >
                <Copy className="h-3 w-3" />
                {copied ? t('onboarding.step2.copied') : t('onboarding.step2.copy')}
              </button>
            </div>

            <div className={`rounded-xl border-2 p-4 text-center ${
              verified ? 'border-green-200 bg-green-50' : 'border-dashed border-gray-200'
            }`}>
              {verified ? (
                <>
                  <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-green-700">{t('onboarding.step3.success')}</p>
                  <button
                    onClick={() => navigate('/dashboard')}
                    className="mt-4 rounded-lg bg-green-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-green-700"
                  >
                    {t('onboarding.step3.goToDashboard')}
                  </button>
                </>
              ) : (
                <>
                  <Loader2 className="h-6 w-6 text-gray-400 mx-auto mb-2 animate-spin" />
                  <p className="text-sm text-gray-500">{t('onboarding.step3.waiting')}…</p>
                  <p className="text-xs text-gray-400 mt-1">Checking every 3 seconds</p>
                </>
              )}
            </div>

            {!verified && (
              <button
                onClick={() => navigate('/dashboard')}
                className="mt-4 w-full text-center text-sm text-gray-400 hover:text-gray-600"
              >
                Skip for now — I'll verify later
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
