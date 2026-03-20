import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, Zap, CreditCard, ArrowLeft, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { fetchJson } from '../lib/api';

interface Plan {
  id: string;
  name: string;
  price: number;
  currency: string;
  sessions: string;
  sites: number;
  retention: string;
  features: string[];
  highlight?: boolean;
}

const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Foundations',
    price: 0,
    currency: 'ETB',
    sessions: '1,000',
    sites: 1,
    retention: '7 days',
    features: [
      '1,000 sessions / month',
      '1 client site',
      '7-day data retention',
      'Basic portfolio monitoring',
      'Basic analytics',
    ],
  },
  {
    id: 'starter',
    name: 'Growth Agency',
    price: 499,
    currency: 'ETB',
    sessions: '10,000',
    sites: 3,
    retention: '90 days',
    highlight: true,
    features: [
      '10,000 sessions / month',
      '3 client sites',
      '90-day data retention',
      'Session replays',
      'Funnel analysis',
      'Telegram alerts',
      'Core Web Vitals',
    ],
  },
  {
    id: 'pro',
    name: 'Portfolio Agency',
    price: 1499,
    currency: 'ETB',
    sessions: '50,000',
    sites: 10,
    retention: '1 year',
    features: [
      '50,000 sessions / month',
      '10 client sites',
      '1-year data retention',
      'Everything in Starter',
      'User flow analysis',
      'Custom alerts',
      'Priority support',
      'API access',
    ],
  },
];

export const BillingPage: React.FC = () => {
  const { t } = useTranslation();
  const { workspace } = useAuth();
  const [currentPlan, setCurrentPlan] = useState<string>(workspace?.plan || 'free');
  const [billingStatus, setBillingStatus] = useState<string>('active');

  useEffect(() => {
    fetchJson<any>('/billing/current', { credentials: 'include' })
      .then(data => {
        if (data.plan) setCurrentPlan(data.plan);
        if (data.billing_status) setBillingStatus(data.billing_status);
      })
      .catch(() => {});
  }, []);

  const statusColor = billingStatus === 'active' ? 'text-green-600 bg-green-50' :
    billingStatus === 'past_due' ? 'text-orange-600 bg-orange-50' :
    'text-red-600 bg-red-50';

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <Link to="/settings" className="text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">{t('billing.title')}</h1>
      </div>
          <p className="text-gray-500 text-sm mb-8 ml-8">{t('billing.subtitle')}</p>

      {/* Current plan badge */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50">
            <Zap className="h-5 w-5 text-primary-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">{t('billing.currentPlan')}</p>
            <p className="font-semibold text-gray-900 capitalize">{currentPlan} Plan</p>
          </div>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${statusColor}`}>
          {billingStatus}
        </span>
      </div>

      <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-2 text-sm text-amber-700">
        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
        <span>
          Billing is intentionally honest in this milestone. Agency upgrades are handled manually via Telegram until Chapa is wired end-to-end.
        </span>
      </div>

      {/* Plan cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {PLANS.map(plan => {
          const isCurrent = plan.id === currentPlan;
          const isHighlighted = plan.highlight;

          return (
            <div
              key={plan.id}
              className={`relative rounded-xl border-2 p-6 flex flex-col ${
                isHighlighted
                  ? 'border-primary-500 bg-primary-50/30'
                  : isCurrent
                  ? 'border-green-400 bg-green-50/20'
                  : 'border-gray-100 bg-white'
              }`}
            >
              {isHighlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
                  Most popular
                </div>
              )}
              {isCurrent && !isHighlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
                  Current plan
                </div>
              )}

              <div className="mb-4">
                <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
                <div className="flex items-baseline gap-1 mt-1">
                  {plan.price === 0 ? (
                    <span className="text-3xl font-bold text-gray-900">Free</span>
                  ) : (
                    <>
                      <span className="text-3xl font-bold text-gray-900">
                        {plan.price.toLocaleString()}
                      </span>
                      <span className="text-sm text-gray-500">ETB / mo</span>
                    </>
                  )}
                </div>
              </div>

              <ul className="space-y-2 mb-6 flex-1">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                    <Check className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <div
                className={`w-full rounded-lg py-2.5 text-center text-sm font-semibold ${
                  isCurrent
                    ? 'bg-green-100 text-green-700'
                    : plan.id === 'free'
                    ? 'bg-gray-100 text-gray-500'
                    : isHighlighted
                    ? 'bg-primary-100 text-primary-700'
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                {isCurrent
                  ? 'Current plan'
                  : plan.id === 'free'
                  ? 'Available by default'
                  : 'Manual upgrade via Telegram'}
              </div>
            </div>
          );
        })}
      </div>

      {/* Payment methods note */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <div className="flex items-center gap-3 mb-3">
          <CreditCard className="h-5 w-5 text-gray-400" />
          <h3 className="font-semibold text-gray-900">{t('billing.payment')}</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {['Chapa', 'Telebirr', 'CBE Birr', 'Bank Transfer'].map(method => (
            <div
              key={method}
              className="rounded-lg border border-gray-200 px-4 py-2.5 text-center text-sm font-medium text-gray-600"
            >
              {method}
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-3">
          Payment integration via Chapa is coming soon. Contact{' '}
          <a href="https://t.me/dxmpulse" className="text-primary-600 hover:underline">
            @dxmpulse on Telegram
          </a>{' '}
          to upgrade your plan manually.
        </p>
      </div>
    </div>
  );
};
