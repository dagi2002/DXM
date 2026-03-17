/**
 * FunnelBuilder — slide-in modal for creating a new funnel.
 * Fields: funnel name + dynamic list of steps (name + URL pattern).
 * Submits to POST /funnels and calls onCreated with the new funnel ID.
 */
import React, { useState } from 'react';
import { Plus, Trash2, X, ShoppingCart, UserPlus, MessageSquare } from 'lucide-react';
import { fetchJson } from '../../../lib/api';

interface Step {
  name: string;
  urlPattern: string;
}

interface Props {
  onClose: () => void;
  onCreated: (funnelId: string) => void;
}

interface FunnelTemplate {
  label: string;
  icon: React.FC<{ className?: string }>;
  name: string;
  steps: Step[];
}

const FUNNEL_TEMPLATES: FunnelTemplate[] = [
  {
    label: 'Purchase Flow',
    icon: ShoppingCart,
    name: 'Purchase Flow',
    steps: [
      { name: 'Home', urlPattern: '/' },
      { name: 'Products', urlPattern: '/products' },
      { name: 'Cart', urlPattern: '/cart' },
      { name: 'Checkout', urlPattern: '/checkout' },
      { name: 'Thank You', urlPattern: '/thank-you' },
    ],
  },
  {
    label: 'Registration Flow',
    icon: UserPlus,
    name: 'Registration Flow',
    steps: [
      { name: 'Home', urlPattern: '/' },
      { name: 'Register', urlPattern: '/register' },
      { name: 'Verify', urlPattern: '/verify' },
      { name: 'Dashboard', urlPattern: '/dashboard' },
    ],
  },
  {
    label: 'Contact Flow',
    icon: MessageSquare,
    name: 'Contact Flow',
    steps: [
      { name: 'Home', urlPattern: '/' },
      { name: 'About', urlPattern: '/about' },
      { name: 'Contact', urlPattern: '/contact' },
      { name: 'Thank You', urlPattern: '/thank-you' },
    ],
  },
];

export const FunnelBuilder: React.FC<Props> = ({ onClose, onCreated }) => {
  const [name, setName] = useState('');
  const [steps, setSteps] = useState<Step[]>([
    { name: 'Landing Page', urlPattern: '/' },
    { name: 'Checkout',     urlPattern: '/checkout' },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addStep = () =>
    setSteps(prev => [...prev, { name: '', urlPattern: '' }]);

  const removeStep = (i: number) =>
    setSteps(prev => prev.filter((_, idx) => idx !== i));

  const updateStep = (i: number, field: keyof Step, value: string) =>
    setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Funnel name is required'); return; }
    if (steps.length < 2) { setError('At least 2 steps are required'); return; }
    if (steps.some(s => !s.name.trim() || !s.urlPattern.trim())) {
      setError('All steps need a name and URL pattern');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const result = await fetchJson<{ id: string }>('/funnels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), steps }),
        credentials: 'include',
      });
      onCreated(result.id);
    } catch {
      setError('Failed to save funnel. Make sure you are logged in.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-lg rounded-t-2xl bg-white p-6 shadow-2xl sm:rounded-2xl">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Create funnel</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Template cards */}
        <div className="mb-5">
          <label className="mb-2 block text-sm font-medium text-gray-700">Start from a template</label>
          <div className="grid grid-cols-3 gap-3">
            {FUNNEL_TEMPLATES.map((tpl) => {
              const Icon = tpl.icon;
              return (
                <button
                  key={tpl.label}
                  type="button"
                  onClick={() => {
                    setName(tpl.name);
                    setSteps(tpl.steps.map(s => ({ ...s })));
                  }}
                  className="flex flex-col items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-3 text-center text-sm transition-colors hover:border-primary-400 hover:bg-primary-50 cursor-pointer"
                >
                  <Icon className="h-5 w-5 text-primary-600" />
                  <span className="font-medium text-gray-700">{tpl.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Funnel name */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Funnel name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Checkout Flow"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
            />
          </div>

          {/* Steps */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Steps (in order)</label>
            <div className="space-y-2">
              {steps.map((step, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-700">
                    {i + 1}
                  </span>
                  <input
                    type="text"
                    value={step.name}
                    onChange={e => updateStep(i, 'name', e.target.value)}
                    placeholder="Step name"
                    className="w-32 flex-shrink-0 rounded-lg border border-gray-200 px-2 py-1.5 text-sm outline-none focus:border-primary-500"
                  />
                  <input
                    type="text"
                    value={step.urlPattern}
                    onChange={e => updateStep(i, 'urlPattern', e.target.value)}
                    placeholder="/url or regex"
                    className="flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-sm font-mono outline-none focus:border-primary-500"
                  />
                  {steps.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeStep(i)}
                      className="flex-shrink-0 rounded-lg p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addStep}
              className="mt-2 inline-flex items-center gap-1 text-sm text-primary-600 hover:underline"
            >
              <Plus className="h-3.5 w-3.5" />
              Add step
            </button>
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Create funnel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
