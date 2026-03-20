import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Lock, Sparkles } from 'lucide-react';
import type { WorkspacePlanId } from '../../../../packages/contracts/index.js';
import { buildBillingPath, getPlanLabel, type UpgradeSource } from '../lib/billing';

interface UpgradeGateProps {
  title: string;
  description: string;
  source: UpgradeSource;
  planId?: WorkspacePlanId;
  eyebrow?: string;
  bullets?: string[];
  ctaLabel?: string;
  className?: string;
}

export const UpgradeGate: React.FC<UpgradeGateProps> = ({
  title,
  description,
  source,
  planId = 'starter',
  eyebrow = 'Paid feature',
  bullets = [],
  ctaLabel,
  className = '',
}) => {
  const targetPlanLabel = getPlanLabel(planId);

  return (
    <div className={`rounded-[28px] border border-primary-200 bg-white p-6 shadow-sm ${className}`}>
      <div className="inline-flex items-center gap-2 rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary-700">
        <Lock className="h-3.5 w-3.5" />
        {eyebrow}
      </div>

      <h2 className="mt-4 text-2xl font-semibold text-surface-900">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-surface-600">{description}</p>

      {bullets.length > 0 && (
        <div className="mt-5 grid gap-3">
          {bullets.map((bullet) => (
            <div key={bullet} className="rounded-2xl border border-surface-200 bg-surface-50 px-4 py-3 text-sm text-surface-700">
              {bullet}
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link
          to={buildBillingPath(planId, source)}
          className="inline-flex items-center gap-2 rounded-2xl bg-primary-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-primary-700"
        >
          {ctaLabel || `Upgrade to ${targetPlanLabel}`}
          <ArrowRight className="h-4 w-4" />
        </Link>
        <span className="inline-flex items-center gap-2 rounded-full bg-surface-100 px-3 py-2 text-xs font-medium text-surface-600">
          <Sparkles className="h-3.5 w-3.5" />
          Manual upgrade, activated after confirmation
        </span>
      </div>
    </div>
  );
};
