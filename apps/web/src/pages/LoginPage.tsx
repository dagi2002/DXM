import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff, ArrowRight, Zap, TrendingUp, Shield, Activity, Lock } from 'lucide-react';

// Rotating stat sets — changes each day of the week so returning users see fresh context
const statSets = [
  // Sunday
  [
    { value: '18+', label: 'Client sites monitored', icon: Activity },
    { value: '81/100', label: 'Avg portfolio health', icon: TrendingUp },
    { value: '< 2min', label: 'Issue detection time', icon: Shield },
  ],
  // Monday
  [
    { value: '98%', label: 'Alert delivery rate', icon: Shield },
    { value: '4.5h', label: 'Saved on reporting/week', icon: Activity },
    { value: '24/7', label: 'Passive monitoring', icon: TrendingUp },
  ],
  // Tuesday
  [
    { value: '18+', label: 'Client sites active', icon: Activity },
    { value: '3×', label: 'Faster issue detection', icon: Shield },
    { value: '100%', label: 'Sessions captured', icon: TrendingUp },
  ],
  // Wednesday
  [
    { value: '81/100', label: 'Avg portfolio health', icon: TrendingUp },
    { value: '0KB', label: 'Page-speed impact', icon: Shield },
    { value: 'Live', label: 'Session replay', icon: Activity },
  ],
  // Thursday
  [
    { value: '12KB', label: 'Snippet size', icon: Shield },
    { value: '7d', label: 'Weekly digest cadence', icon: Activity },
    { value: 'ETB', label: 'Local payment support', icon: TrendingUp },
  ],
  // Friday
  [
    { value: '3+', label: 'Billable fixes found/week', icon: Activity },
    { value: 'AI', label: 'Portfolio brief generation', icon: TrendingUp },
    { value: '< 2min', label: 'Issue detection time', icon: Shield },
  ],
  // Saturday
  [
    { value: '18+', label: 'Client sites monitored', icon: Activity },
    { value: 'Telegram', label: 'Native alert delivery', icon: Shield },
    { value: 'Free', label: 'To start, no card needed', icon: TrendingUp },
  ],
];

const stats = statSets[new Date().getDay()];

export const LoginPage: React.FC = () => {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/overview';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* ── Left panel ─────────────────────────────────────────── */}
      <div className="relative hidden overflow-hidden lg:flex lg:w-[52%] flex-col justify-between bg-gradient-to-br from-primary-950 via-primary-900 to-primary-800 p-12">
        {/* Decorative blobs */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-primary-600/20 blur-3xl" />
          <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-accent-500/10 blur-3xl" />
          <div className="absolute top-1/2 left-1/4 h-64 w-64 rounded-full bg-primary-400/10 blur-2xl" />
        </div>

        {/* Grid pattern overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'40\' height=\'40\' viewBox=\'0 0 40 40\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\'%3E%3Cpath d=\'M0 0h40v1H0zm0 39h40v1H0zM0 0v40H1V0zm39 0v40h1V0z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")', backgroundSize: '40px 40px' }}
        />

        <div className="relative">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 backdrop-blur ring-1 ring-white/20">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-base font-bold text-white">DXM Pulse</p>
              <p className="text-[11px] uppercase tracking-[0.2em] text-primary-300">Agency Suite</p>
            </div>
          </div>
        </div>

        <div className="relative space-y-8">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary-300 backdrop-blur">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              Live agency platform
            </div>

            <h2 className="mt-5 text-4xl font-bold leading-tight tracking-tight text-white lg:text-5xl">
              Monitor every<br />
              client site.<br />
              <span className="text-primary-300">Prove your value.</span>
            </h2>
            <p className="mt-4 max-w-sm text-base leading-7 text-primary-200">
              The first Digital Experience Management platform built for Ethiopian agencies. Real sessions, real alerts, real proof.
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            {stats.map(({ value, label, icon: Icon }) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                <Icon className="h-4 w-4 text-primary-300" />
                <p className="mt-3 text-2xl font-bold text-white">{value}</p>
                <p className="mt-1 text-xs leading-4 text-primary-300">{label}</p>
              </div>
            ))}
          </div>

          {/* Testimonial */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <p className="text-sm italic leading-6 text-primary-100">
              "We used to spend hours building client reports. DXM Pulse gives us the narrative in minutes — and catches issues before the client calls."
            </p>
            <div className="mt-4 flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center text-xs font-bold text-white">
                AG
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Addis Growth Studio</p>
                <p className="text-xs text-primary-300">Digital Agency · Addis Ababa</p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative">
          <p className="text-xs text-primary-400">
            © 2025 DXM Pulse · Built for Ethiopian agencies
          </p>
        </div>
      </div>

      {/* ── Right panel — form ──────────────────────────────────── */}
      <div className="flex w-full flex-col items-center justify-center bg-white px-6 py-12 lg:w-[48%]">
        <div className="w-full max-w-[400px]">
          {/* Mobile logo */}
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary-600 to-primary-800">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold text-surface-900">DXM Pulse</span>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-surface-900">Enter your workspace</h1>
          <p className="mt-1.5 text-sm text-surface-500">Sign in to your agency command center</p>

          {error && (
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error || t('common.error')}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1.5">
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full rounded-xl border border-surface-200 bg-surface-50 px-4 py-3 text-sm text-surface-900 placeholder-surface-400 transition focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-primary-500/10"
                placeholder="you@youragency.com"
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="block text-sm font-medium text-surface-700">Password</label>
                <Link
                  to="/forgot-password"
                  className="text-xs font-medium text-primary-600 hover:text-primary-700"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full rounded-xl border border-surface-200 bg-surface-50 px-4 py-3 pr-11 text-sm text-surface-900 placeholder-surface-400 transition focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-primary-500/10"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 transition hover:text-surface-600"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full overflow-hidden rounded-xl bg-primary-600 py-3.5 text-sm font-semibold text-white transition hover:bg-primary-700 focus:outline-none focus:ring-4 focus:ring-primary-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="flex items-center justify-center gap-2">
                {isLoading ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    {t('common.loading')}
                  </>
                ) : (
                  <>
                    Sign in
                    <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                  </>
                )}
              </span>
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-surface-500">
            No account yet?{' '}
            <Link to="/signup" className="font-semibold text-primary-600 hover:text-primary-700">
              Start free trial
            </Link>
          </p>

          <div className="mt-6 rounded-xl border border-dashed border-surface-200 bg-surface-50 p-4 text-center">
            <p className="text-xs text-surface-400">Exploring first?</p>
            <Link
              to="/demo"
              className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-700"
            >
              <Zap className="h-3.5 w-3.5" />
              View live demo
            </Link>
          </div>

          <div className="mt-6 flex items-center justify-center gap-1.5 text-xs text-surface-400">
            <Lock className="h-3 w-3" />
            <span>256-bit SSL · Your session data is always encrypted</span>
          </div>
        </div>
      </div>
    </div>
  );
};
