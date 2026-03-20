import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff, Zap } from 'lucide-react';

export const LoginPage: React.FC = () => {
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
    <div className="flex min-h-screen bg-gray-50">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col items-center justify-center bg-primary-600 p-12 text-white">
        <div className="max-w-md">
          <div className="flex items-center gap-3 mb-8">
            <Zap className="h-10 w-10" />
            <span className="text-3xl font-bold">DXM Pulse</span>
          </div>
          <h2 className="text-4xl font-bold mb-4 leading-tight">
            Monitor every client site.<br />Prove your agency value.
          </h2>
          <p className="text-primary-200 text-lg">
            Session replay, performance insight, and proactive alerts for agencies managing client websites in Ethiopia.
          </p>
          <div className="mt-10 grid grid-cols-2 gap-6">
            {[
              { label: 'Client Sites', value: '18' },
              { label: 'At-Risk Sites', value: '3' },
              { label: 'Weekly Alerts', value: '12' },
              { label: 'Avg Health', value: '81/100' },
            ].map(stat => (
              <div key={stat.label} className="bg-primary-700 rounded-xl p-4">
                <div className="text-2xl font-bold">{stat.value}</div>
                <div className="text-primary-300 text-sm mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="w-full lg:w-1/2 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <Zap className="h-7 w-7 text-primary-600" />
            <span className="text-xl font-bold text-gray-900">DXM Pulse</span>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-1">Welcome back</h1>
          <p className="text-gray-500 mb-8">Sign in to your agency workspace</p>

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                placeholder="you@yourcompany.com"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-gray-700">Password</label>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full rounded-lg border border-gray-200 px-4 py-3 pr-11 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-lg bg-primary-600 py-3 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            Don't have an account?{' '}
            <Link to="/signup" className="font-medium text-primary-600 hover:underline">
              Start free trial
            </Link>
          </p>

          {/* Demo shortcut */}
          <div className="mt-8 rounded-xl border border-dashed border-gray-200 p-4 text-center">
            <p className="text-xs text-gray-400 mb-2">Want to explore first?</p>
            <Link
              to="/demo"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:underline"
            >
              <Zap className="h-3.5 w-3.5" />
              View live demo
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
