import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle,
  Copy,
  ArrowRight,
  Zap,
  Code2,
  Globe2,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  ExternalLink,
} from 'lucide-react';
import { getApiUrl } from '../lib/api';
import { UpgradeGate } from '../components/UpgradeGate';
import { useAuth } from '../context/AuthContext';
import { getRecommendedUpgradePlan } from '../lib/billing';

type Step = 1 | 2 | 3;
type Platform = 'html' | 'wordpress' | 'react';

interface SiteInfo {
  id?: string;
  siteId?: string;
  siteKey: string;
  snippet: string;
}

const STEP_LABELS = ['Workspace', 'Add site', 'Install & verify'];

const platformTabs: { id: Platform; label: string; icon: React.ReactNode }[] = [
  { id: 'html', label: 'HTML', icon: <Code2 className="h-3.5 w-3.5" /> },
  { id: 'wordpress', label: 'WordPress', icon: <Globe2 className="h-3.5 w-3.5" /> },
  { id: 'react', label: 'React / Next.js', icon: <Code2 className="h-3.5 w-3.5" /> },
];

function buildSnippet(snippet: string, platform: Platform): string {
  if (platform === 'html') {
    return `<!-- Step 1: Paste inside your <head> tag -->\n${snippet}\n\n<!-- That's it. DXM Pulse starts collecting sessions immediately. -->`;
  }
  if (platform === 'wordpress') {
    return `// Option A — Theme functions.php\nfunction dxm_pulse_snippet() {\n  echo '${snippet}';\n}\nadd_action('wp_head', 'dxm_pulse_snippet');\n\n// Option B — Use a plugin like "Insert Headers and Footers"\n// Paste the snippet below into the Head section:\n${snippet}`;
  }
  // react / next.js
  return `// pages/_document.tsx  (Next.js)\nimport { Html, Head, Main, NextScript } from 'next/document';\n\nexport default function Document() {\n  return (\n    <Html>\n      <Head>\n        {/* DXM Pulse tracking */}\n        ${snippet}\n      </Head>\n      <body>\n        <Main />\n        <NextScript />\n      </body>\n    </Html>\n  );\n}\n\n// For React (index.html) add the snippet inside <head>`;
}

export const OnboardingPage: React.FC = () => {
  const navigate = useNavigate();
  const { workspace, user } = useAuth();
  const [step, setStep] = useState<Step>(1);
  const [domain, setDomain] = useState('');
  const [siteName, setSiteName] = useState('');
  const [site, setSite] = useState<SiteInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [verified, setVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [platform, setPlatform] = useState<Platform>('html');

  useEffect(() => {
    const siteId = site?.id ?? site?.siteId;
    if (step !== 3 || !siteId || verified || timedOut) return;
    setVerifying(true);
    const poll = async () => {
      try {
        const res = await fetch(getApiUrl(`/sites/${siteId}/verify`), { credentials: 'include' });
        const data = await res.json();
        if (data.verified) { setVerified(true); setVerifying(false); }
      } catch {}
    };
    void poll();
    const id = setInterval(poll, 3000);
    const timeout = setTimeout(() => {
      clearInterval(id);
      setVerifying(false);
      setTimedOut(true);
    }, 3 * 60 * 1000);
    return () => { clearInterval(id); clearTimeout(timeout); };
  }, [step, site, verified, timedOut]);

  const handleAddSite = async () => {
    if (!domain || !siteName) return;
    setError(null);
    setLimitReached(false);
    try {
      const res = await fetch(getApiUrl('/sites'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: siteName, domain }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({ error: 'Failed to create site' }));
        if (res.status === 409 && e?.code === 'plan_limit_reached') setLimitReached(true);
        throw new Error(e.error || 'Failed to create site');
      }
      const data = await res.json();
      setSite({ ...data, id: data.id ?? data.siteId, siteId: data.siteId ?? data.id });
      setVerified(false);
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create site');
    }
  };

  const copySnippet = () => {
    if (!site) return;
    navigator.clipboard.writeText(site.snippet).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const inputClass =
    'w-full rounded-xl border border-surface-200 bg-surface-50 px-4 py-3 text-sm text-surface-900 placeholder-surface-400 transition focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-primary-500/10';

  return (
    <div className="min-h-screen bg-gradient-to-br from-surface-50 to-surface-100 flex flex-col">
      {/* Top bar */}
      <div className="border-b border-surface-200 bg-white/80 backdrop-blur px-6 py-4">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary-600 to-primary-800">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <span className="text-base font-bold text-surface-900">DXM Pulse</span>
          </div>
          <button
            onClick={() => navigate('/overview')}
            className="text-sm text-surface-400 hover:text-surface-600 transition"
          >
            Skip setup
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-2xl">
          {/* Step indicator */}
          <div className="mb-8 flex items-center gap-0">
            {STEP_LABELS.map((label, i) => {
              const s = (i + 1) as Step;
              const done = step > s;
              const active = step === s;
              return (
                <React.Fragment key={s}>
                  <div className="flex flex-col items-center">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all ${
                      done ? 'bg-emerald-500 text-white' :
                      active ? 'bg-primary-600 text-white ring-4 ring-primary-100' :
                      'bg-surface-200 text-surface-500'
                    }`}>
                      {done ? <CheckCircle2 className="h-4 w-4" /> : s}
                    </div>
                    <p className={`mt-1.5 text-[11px] font-semibold ${active ? 'text-primary-600' : done ? 'text-emerald-600' : 'text-surface-400'}`}>
                      {label}
                    </p>
                  </div>
                  {i < 2 && (
                    <div className={`mb-4 h-0.5 flex-1 mx-2 transition-all ${done ? 'bg-emerald-400' : 'bg-surface-200'}`} />
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {/* ── Step 1 ── */}
          {step === 1 && (
            <div className="rounded-2xl border border-surface-200 bg-white p-8 shadow-sm">
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50">
                <Zap className="h-6 w-6 text-primary-600" />
              </div>
              <h2 className="text-xl font-bold text-surface-900">Your workspace is ready</h2>
              <p className="mt-2 text-sm leading-6 text-surface-500">
                Connect your first client site to unlock the portfolio overview, session replay, and alert monitoring.
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-surface-200 bg-surface-50 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-surface-500">Workspace</p>
                  <p className="mt-2 text-sm font-semibold text-surface-900">{workspace?.name || 'Your workspace'}</p>
                </div>
                <div className="rounded-xl border border-surface-200 bg-surface-50 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-surface-500">Account</p>
                  <p className="mt-2 text-sm font-semibold text-surface-900">{user?.email || 'Signed in'}</p>
                </div>
              </div>

              <div className="mt-5 rounded-xl border border-primary-100 bg-primary-50 p-4">
                <p className="text-sm text-primary-800">
                  DXM Pulse becomes powerful the moment you install tracking on one live client site. We will generate a lightweight snippet, then verify the install automatically.
                </p>
              </div>

              <button
                onClick={() => setStep(2)}
                className="mt-6 group flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 py-3.5 text-sm font-semibold text-white hover:bg-primary-700 transition"
              >
                Connect first client site
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </button>
            </div>
          )}

          {/* ── Step 2 ── */}
          {step === 2 && (
            <div className="rounded-2xl border border-surface-200 bg-white p-8 shadow-sm">
              <h2 className="text-xl font-bold text-surface-900">Add your first client site</h2>
              <p className="mt-2 text-sm leading-6 text-surface-500">
                Start with the site you care about most this week. You can add more from the Clients page anytime.
              </p>

              {error && (
                <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              <div className="mt-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-1.5">
                    Client name <span className="text-surface-400 font-normal">(how you refer to them internally)</span>
                  </label>
                  <input
                    value={siteName}
                    onChange={e => { setSiteName(e.target.value); setLimitReached(false); }}
                    className={inputClass}
                    placeholder="Abebe Furniture"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-1.5">Client website domain</label>
                  <input
                    value={domain}
                    onChange={e => { setDomain(e.target.value); setLimitReached(false); }}
                    className={inputClass}
                    placeholder="abebefurniture.et"
                  />
                  <p className="mt-1 text-xs text-surface-400">No need for https:// — just the domain.</p>
                </div>

                {limitReached ? (
                  <UpgradeGate
                    source="site_limit"
                    planId={getRecommendedUpgradePlan(workspace?.plan || 'free')}
                    eyebrow="Tracked-site limit reached"
                    title="Upgrade to add another client site."
                    description="This workspace has reached its current site limit."
                    bullets={[
                      'Upgrade your plan, then return to finish setup',
                      'All your existing data stays intact',
                    ]}
                  />
                ) : (
                  <button
                    onClick={handleAddSite}
                    disabled={!domain || !siteName}
                    className="group flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 py-3.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    Generate install snippet
                    <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Step 3 ── */}
          {step === 3 && site && (
            <div className="rounded-2xl border border-surface-200 bg-white shadow-sm overflow-hidden">
              {/* Header */}
              <div className="border-b border-surface-200 px-8 py-6">
                <h2 className="text-xl font-bold text-surface-900">Install the tracking snippet</h2>
                <p className="mt-1.5 text-sm text-surface-500">
                  Add the snippet to <strong className="text-surface-700">{site.siteKey}</strong> and we'll automatically confirm when traffic comes through.
                </p>
              </div>

              <div className="px-8 py-6 space-y-6">
                {/* How-to steps */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-surface-500">How to install</p>
                  {[
                    { n: '1', text: 'Choose your platform below' },
                    { n: '2', text: 'Copy the generated snippet' },
                    { n: '3', text: 'Paste it inside the <head> tag of your site and publish' },
                  ].map(({ n, text }) => (
                    <div key={n} className="flex items-start gap-3">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-700">{n}</div>
                      <p className="text-sm leading-6 text-surface-700">{text}</p>
                    </div>
                  ))}
                </div>

                {/* Platform tabs */}
                <div>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-surface-500">Choose your platform</p>
                  <div className="flex gap-2 flex-wrap">
                    {platformTabs.map(({ id, label, icon }) => (
                      <button
                        key={id}
                        onClick={() => setPlatform(id)}
                        className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition ${
                          platform === id
                            ? 'border-primary-300 bg-primary-50 text-primary-700'
                            : 'border-surface-200 bg-white text-surface-600 hover:border-surface-300'
                        }`}
                      >
                        {icon}
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Code block */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-surface-500">Your tracking snippet</p>
                    <button
                      onClick={copySnippet}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        copied
                          ? 'bg-emerald-500 text-white'
                          : 'bg-surface-900 text-white hover:bg-surface-800'
                      }`}
                    >
                      {copied ? (
                        <>
                          <CheckCircle className="h-3.5 w-3.5" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          Copy snippet
                        </>
                      )}
                    </button>
                  </div>
                  <div className="relative rounded-xl bg-surface-950 overflow-hidden">
                    <div className="flex items-center gap-1.5 px-4 py-3 border-b border-white/5">
                      <div className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
                      <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/70" />
                      <div className="h-2.5 w-2.5 rounded-full bg-green-500/70" />
                      <span className="ml-2 text-[11px] text-surface-500">{platform === 'html' ? 'index.html' : platform === 'wordpress' ? 'functions.php' : '_document.tsx'}</span>
                    </div>
                    <pre className="overflow-x-auto p-5 text-xs leading-6 text-emerald-300 font-mono whitespace-pre-wrap break-all">
                      {buildSnippet(site.snippet, platform)}
                    </pre>
                  </div>
                  <p className="mt-2 text-xs text-surface-400">
                    The snippet is only {site.snippet.length} characters — lightweight and async, no impact on page speed.
                  </p>
                </div>

                {/* Verification status */}
                <div className={`rounded-2xl border-2 p-6 text-center transition-all ${
                  verified ? 'border-emerald-300 bg-emerald-50' :
                  timedOut ? 'border-amber-200 bg-amber-50' :
                  'border-dashed border-surface-200 bg-surface-50'
                }`}>
                  {verified ? (
                    <>
                      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
                        <CheckCircle className="h-6 w-6 text-emerald-600" />
                      </div>
                      <p className="text-base font-bold text-emerald-800">Tracking is live</p>
                      <p className="mt-1 text-sm text-emerald-600">First session detected — your portfolio overview is now active.</p>
                      <button
                        onClick={() => navigate('/overview')}
                        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 transition"
                      >
                        Open portfolio overview <ArrowRight className="h-4 w-4" />
                      </button>
                    </>
                  ) : timedOut ? (
                    <>
                      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
                        <AlertCircle className="h-6 w-6 text-amber-600" />
                      </div>
                      <p className="text-base font-bold text-amber-800">No session detected yet</p>
                      <p className="mt-1 text-sm text-amber-600">
                        Make sure the snippet is inside the <code className="rounded bg-amber-100 px-1 text-xs">&lt;head&gt;</code> tag and the page is published live.
                      </p>
                      <div className="mt-4 flex items-center justify-center gap-3">
                        <button
                          onClick={() => { setTimedOut(false); setVerifying(false); }}
                          className="flex items-center gap-2 rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50 transition"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Retry verification
                        </button>
                        <a
                          href="https://docs.dxmpulse.com/install"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-sm font-medium text-amber-700 hover:underline"
                        >
                          Install guide <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-100">
                        <span className="relative flex h-3 w-3">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-400 opacity-75" />
                          <span className="relative inline-flex h-3 w-3 rounded-full bg-primary-500" />
                        </span>
                      </div>
                      <p className="text-base font-semibold text-surface-700">
                        {verifying ? 'Listening for first session…' : 'Waiting for deployment…'}
                      </p>
                      <p className="mt-1 text-sm text-surface-500">
                        After publishing, open the site in a new tab and browse around to trigger tracking.
                      </p>
                    </>
                  )}
                </div>

                {!verified && (
                  <button
                    onClick={() => navigate('/overview')}
                    className="w-full text-center text-sm text-surface-400 hover:text-surface-600 transition py-2"
                  >
                    Skip verification — I'll confirm from the dashboard later
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
