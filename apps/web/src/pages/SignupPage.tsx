import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff, ArrowRight, Zap, CheckCircle2 } from 'lucide-react';
import {
  AGENCY_TYPE_OPTIONS,
  MANAGED_SITES_BAND_OPTIONS,
  REPORTING_WORKFLOW_OPTIONS,
  type AgencyType,
  type ManagedSitesBand,
  type ReportingWorkflow,
} from '../lib/workspaceSignals';

const benefits = [
  'Portfolio-level view of all client sites',
  'Session replay and behavioral heatmaps',
  'AI-powered weekly agency narrative',
  'Telegram alerts for critical issues',
  'Free to start — no card required',
];

export const SignupPage: React.FC = () => {
  const { signup } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    workspaceName: '',
    agencyType: '',
    managedSitesBand: '',
    reportingWorkflow: '',
    evaluationReason: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOptional, setShowOptional] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setIsLoading(true);
    try {
      await signup({
        name: form.name,
        email: form.email,
        password: form.password,
        workspaceName: form.workspaceName,
        agencyType: form.agencyType ? (form.agencyType as AgencyType) : null,
        managedSitesBand: form.managedSitesBand ? (form.managedSitesBand as ManagedSitesBand) : null,
        reportingWorkflow: form.reportingWorkflow ? (form.reportingWorkflow as ReportingWorkflow) : null,
        evaluationReason: form.evaluationReason.trim() || null,
      });
      navigate('/onboarding', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed');
    } finally {
      setIsLoading(false);
    }
  };

  const inputClass =
    'w-full rounded-xl border border-surface-200 bg-surface-50 px-4 py-3 text-sm text-surface-900 placeholder-surface-400 transition focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-primary-500/10';

  return (
    <div className="flex min-h-screen">
      {/* ── Left panel ─────────────────────────────────────────── */}
      <div className="relative hidden overflow-hidden lg:flex lg:w-[44%] flex-col justify-between bg-gradient-to-br from-primary-950 via-primary-900 to-primary-800 p-12">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 -right-16 h-96 w-96 rounded-full bg-primary-600/20 blur-3xl" />
          <div className="absolute bottom-20 -left-20 h-80 w-80 rounded-full bg-accent-500/10 blur-3xl" />
        </div>

        <div className="relative">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-base font-bold text-white">DXM Pulse</p>
              <p className="text-[11px] uppercase tracking-[0.2em] text-primary-300">Agency Suite</p>
            </div>
          </Link>
        </div>

        <div className="relative space-y-8">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary-300">
              Free to start
            </div>
            <h2 className="mt-5 text-4xl font-bold leading-tight text-white">
              Your agency command center starts here.
            </h2>
            <p className="mt-4 text-base leading-7 text-primary-200">
              Join agencies across Ethiopia who use DXM Pulse to monitor client sites, catch issues first, and deliver better reporting.
            </p>
          </div>

          <div className="space-y-3">
            {benefits.map(benefit => (
              <div key={benefit} className="flex items-center gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                </div>
                <p className="text-sm text-primary-100">{benefit}</p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-300">What you get on day one</p>
            <p className="mt-3 text-sm leading-6 text-primary-100">
              As soon as you install the snippet on one client site, DXM Pulse starts building your portfolio overview — sessions, health scores, alerts, and a weekly digest ready to share.
            </p>
          </div>
        </div>

        <div className="relative">
          <p className="text-xs text-primary-400">© 2025 DXM Pulse · Addis Ababa, Ethiopia</p>
        </div>
      </div>

      {/* ── Right panel — form ──────────────────────────────────── */}
      <div className="flex w-full flex-col items-center justify-center bg-white px-6 py-12 lg:w-[56%] overflow-y-auto">
        <div className="w-full max-w-[460px]">
          {/* Mobile logo */}
          <div className="mb-6 flex items-center gap-2 lg:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary-600 to-primary-800">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold text-surface-900">DXM Pulse</span>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-surface-900">Create your agency workspace</h1>
          <p className="mt-1.5 text-sm text-surface-500">Start free. Connect your first client site in minutes.</p>

          {error && (
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1.5">Your name</label>
                <input type="text" value={form.name} onChange={set('name')} required className={inputClass} placeholder="Abebe Kebede" />
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1.5">Work email</label>
                <input type="email" value={form.email} onChange={set('email')} required className={inputClass} placeholder="abebe@youragency.com" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1.5">Workspace name</label>
              <input
                type="text" value={form.workspaceName} onChange={set('workspaceName')} required
                className={inputClass} placeholder="Addis Growth Studio"
              />
              <p className="mt-1 text-xs text-surface-400">Your agency or studio name</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'} value={form.password}
                  onChange={set('password')} required minLength={8}
                  className={`${inputClass} pr-11`} placeholder="Minimum 8 characters"
                />
                <button
                  type="button" onClick={() => setShowPassword(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Optional profile section */}
            <div className="rounded-xl border border-surface-200 bg-surface-50 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowOptional(v => !v)}
                className="flex w-full items-center justify-between px-4 py-3.5 text-sm font-medium text-surface-700 hover:bg-surface-100 transition"
              >
                <span>Help us tailor DXM Pulse <span className="text-surface-400 font-normal">(optional)</span></span>
                <svg
                  className={`h-4 w-4 text-surface-400 transition-transform ${showOptional ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showOptional && (
                <div className="border-t border-surface-200 px-4 pb-4 pt-4 space-y-4">
                  <p className="text-xs text-surface-500">Helps us prioritize which features matter most for your workflow.</p>
                  <div>
                    <label className="block text-sm font-medium text-surface-700 mb-1.5">Agency type</label>
                    <select value={form.agencyType} onChange={set('agencyType')} className={inputClass}>
                      <option value="">Select one</option>
                      {AGENCY_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-surface-700 mb-1.5">Client sites you manage</label>
                    <select value={form.managedSitesBand} onChange={set('managedSitesBand')} className={inputClass}>
                      <option value="">Select one</option>
                      {MANAGED_SITES_BAND_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-surface-700 mb-1.5">Current reporting workflow</label>
                    <select value={form.reportingWorkflow} onChange={set('reportingWorkflow')} className={inputClass}>
                      <option value="">Select one</option>
                      {REPORTING_WORKFLOW_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>
              )}
            </div>

            <button
              type="submit" disabled={isLoading}
              className="group w-full rounded-xl bg-primary-600 py-3.5 text-sm font-semibold text-white transition hover:bg-primary-700 focus:outline-none focus:ring-4 focus:ring-primary-500/20 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <span className="flex items-center justify-center gap-2">
                {isLoading ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Creating workspace…
                  </>
                ) : (
                  <>
                    Create free account
                    <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                  </>
                )}
              </span>
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-surface-500">
            Already have a workspace?{' '}
            <Link to="/login" className="font-semibold text-primary-600 hover:text-primary-700">Sign in</Link>
          </p>
          <p className="mt-3 text-center text-xs text-surface-400">
            By creating an account you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  );
};
