import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff, Zap } from 'lucide-react';
import {
  AGENCY_TYPE_OPTIONS,
  MANAGED_SITES_BAND_OPTIONS,
  REPORTING_WORKFLOW_OPTIONS,
  type AgencyType,
  type ManagedSitesBand,
  type ReportingWorkflow,
} from '../lib/workspaceSignals';

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
        managedSitesBand: form.managedSitesBand
          ? (form.managedSitesBand as ManagedSitesBand)
          : null,
        reportingWorkflow: form.reportingWorkflow
          ? (form.reportingWorkflow as ReportingWorkflow)
          : null,
        evaluationReason: form.evaluationReason.trim() || null,
      });
      navigate('/onboarding', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-50 items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 mb-8">
          <Zap className="h-7 w-7 text-primary-600" />
          <span className="text-xl font-bold text-gray-900">DXM Pulse</span>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-1">Create your agency workspace</h1>
        <p className="text-gray-500 mb-8">Start with one client site and grow into a full reporting portfolio.</p>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Your name</label>
            <input
              type="text" value={form.name} onChange={set('name')} required
              className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
              placeholder="Abebe Kebede"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Work email</label>
            <input
              type="email" value={form.email} onChange={set('email')} required
              className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
              placeholder="abebe@yourcompany.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Workspace name</label>
            <input
              type="text" value={form.workspaceName} onChange={set('workspaceName')} required
              className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
              placeholder="Addis Growth Studio"
            />
            <p className="text-xs text-gray-400 mt-1">Usually your agency or studio name</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'} value={form.password}
                onChange={set('password')} required minLength={8}
                className="w-full rounded-lg border border-gray-200 px-4 py-3 pr-11 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                placeholder="Min. 8 characters"
              />
              <button
                type="button" onClick={() => setShowPassword(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <p className="text-sm font-semibold text-gray-900">Help us tailor DXM</p>
            <p className="mt-1 text-xs leading-5 text-gray-500">
              Optional, but useful while DXM is in early beta and we are narrowing on the best-fit agency workflow.
            </p>

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Agency type</label>
                <select
                  value={form.agencyType}
                  onChange={set('agencyType')}
                  className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                >
                  <option value="">Select one</option>
                  {AGENCY_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Managed client sites</label>
                <select
                  value={form.managedSitesBand}
                  onChange={set('managedSitesBand')}
                  className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                >
                  <option value="">Select one</option>
                  {MANAGED_SITES_BAND_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Current reporting workflow</label>
                <select
                  value={form.reportingWorkflow}
                  onChange={set('reportingWorkflow')}
                  className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                >
                  <option value="">Select one</option>
                  {REPORTING_WORKFLOW_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Why are you evaluating DXM right now?</label>
                <input
                  type="text"
                  value={form.evaluationReason}
                  onChange={set('evaluationReason')}
                  className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                  placeholder="Example: we need cleaner client reporting and faster issue detection"
                />
              </div>
            </div>
          </div>

          <button
            type="submit" disabled={isLoading}
            className="w-full rounded-lg bg-primary-600 py-3 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Creating account…' : 'Create free account'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-primary-600 hover:underline">Sign in</Link>
        </p>
        <p className="mt-3 text-center text-xs text-gray-400">
          By signing up you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
};
