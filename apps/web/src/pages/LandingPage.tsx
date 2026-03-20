import React from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bot,
  Building2,
  CheckCircle2,
  Clock3,
  Eye,
  FileText,
  Gauge,
  Globe2,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import { SiteAudit } from '../components/Landing/SiteAudit';
import { PLAN_CATALOG } from '../lib/billing';

const pains = [
  {
    title: 'Clients discover broken experiences before you do',
    body: 'A slow landing page, dead CTA, or broken checkout becomes your agency problem the moment the client notices it first.',
    icon: AlertTriangle,
  },
  {
    title: 'Reporting is too reactive',
    body: 'Most agencies scramble at the end of the week to explain traffic and conversions instead of monitoring the story as it unfolds.',
    icon: Clock3,
  },
  {
    title: 'Too many tools, not enough operational clarity',
    body: 'Analytics, replay, and alerts live in different places, so your team loses time switching contexts instead of solving issues.',
    icon: Eye,
  },
];

const features = [
  {
    title: 'Portfolio overview',
    body: 'See every client site, its health score, recent activity, and at-risk accounts in one agency dashboard.',
    icon: Building2,
  },
  {
    title: 'Session replay and behavioral insight',
    body: 'Show clients how real visitors moved, hesitated, clicked, and dropped out instead of guessing from numbers alone.',
    icon: PlayCircle,
  },
  {
    title: 'Alert-led account management',
    body: 'Catch issues before clients do, send Telegram digests, and turn raw issues into proactive status updates.',
    icon: Bot,
  },
];

const workflow = [
  {
    step: '01',
    title: 'Add client sites in minutes',
    body: 'Create a client record, copy the lightweight snippet, and verify installation without leaving the product.',
  },
  {
    step: '02',
    title: 'Monitor the portfolio like an operator',
    body: 'Watch health, alerts, replay, funnels, and performance from one coherent agency command center.',
  },
  {
    step: '03',
    title: 'Turn insight into client-facing proof',
    body: 'Use ready-to-share summaries and weekly narratives that make your work visible and measurable.',
  },
];

export const LandingPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-surface-50 text-surface-900">
      <nav className="sticky top-0 z-50 border-b border-primary-900/10 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-600 to-primary-800 shadow-lg">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-base font-bold text-surface-900">DXM Pulse</p>
              <p className="text-xs uppercase tracking-[0.18em] text-surface-500">Agency Suite</p>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <Link to="/login" className="hidden text-sm font-medium text-surface-600 transition hover:text-surface-900 sm:inline">
              Sign in
            </Link>
            <Link
              to="/demo"
              className="rounded-2xl bg-surface-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-surface-950"
            >
              View demo
            </Link>
            <Link
              to="/signup"
              className="rounded-2xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-700"
            >
              Start free
            </Link>
          </div>
        </div>
      </nav>

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(22,101,52,0.16),_transparent_38%),radial-gradient(circle_at_bottom_right,_rgba(217,119,6,0.14),_transparent_32%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-24">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-primary-700">
              <Sparkles className="h-3.5 w-3.5" />
              Premium analytics for Ethiopian agencies
            </div>
            <h1 className="mt-6 text-4xl font-bold leading-tight text-surface-900 md:text-6xl">
              Monitor all your client websites from one operational command center.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-surface-600">
              Catch issues before clients do, prove the value of your work with replay and performance insight, and run a cleaner reporting operation across the whole portfolio.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/demo"
                className="inline-flex items-center gap-2 rounded-2xl bg-surface-900 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-surface-950"
              >
                View demo <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/signup"
                className="inline-flex items-center gap-2 rounded-2xl border border-surface-300 bg-white px-6 py-3.5 text-sm font-semibold text-surface-900 transition hover:border-primary-300 hover:text-primary-700"
              >
                Start free
              </Link>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {[
                { label: 'Portfolio health', value: '81/100', note: 'live agency benchmark' },
                { label: 'Client sites monitored', value: '30+', note: 'starter growth tier' },
                { label: 'Weekly report prep', value: '< 10 min', note: 'from live portfolio data' },
              ].map((item) => (
                <div key={item.label} className="rounded-3xl border border-surface-200 bg-white/90 p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-surface-500">{item.label}</p>
                  <p className="mt-3 text-2xl font-bold text-surface-900">{item.value}</p>
                  <p className="mt-2 text-sm text-surface-500">{item.note}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:pl-8">
            <div className="rounded-[32px] border border-primary-200 bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 p-6 text-white shadow-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-100">Live demo portfolio</p>
                  <h2 className="mt-2 text-2xl font-semibold">Addis Growth Studio</h2>
                </div>
                <div className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary-100">
                  18 client sites
                </div>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {[
                  { title: 'Average health score', value: '81/100', icon: Gauge },
                  { title: 'Sites needing attention', value: '3', icon: AlertTriangle },
                  { title: 'Replay-ready sessions', value: '428', icon: Eye },
                  { title: 'Reports this week', value: '12', icon: FileText },
                ].map(({ title, value, icon: Icon }) => (
                  <div key={title} className="rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm text-primary-100">{title}</p>
                      <Icon className="h-4 w-4 text-primary-100" />
                    </div>
                    <p className="mt-4 text-3xl font-semibold">{value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-6 rounded-3xl border border-white/10 bg-white/10 p-5 backdrop-blur">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-100">This week’s narrative</p>
                <p className="mt-3 text-sm leading-7 text-primary-50">
                  Three client sites need follow-up before the next round of check-ins. One checkout flow is slowing down on mobile, while your strongest retail client improved conversion again after the last landing page fix.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
        <div className="rounded-[32px] border border-surface-200 bg-white p-6 shadow-sm md:p-8">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-700">Proof before signup</p>
            <h2 className="mt-3 text-3xl font-bold text-surface-900">Run a 60-second site audit while you are still deciding.</h2>
            <p className="mt-3 text-sm leading-6 text-surface-600">
              Get an immediate read on response time, mobile readiness, and page weight before you even install the snippet.
            </p>
          </div>
          <div className="mt-8">
            <SiteAudit />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-700">Agency pain</p>
          <h2 className="mt-3 text-3xl font-bold text-surface-900">This is built for agencies carrying the operational risk of client websites.</h2>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {pains.map(({ title, body, icon: Icon }) => (
            <div key={title} className="rounded-[28px] border border-surface-200 bg-white p-6 shadow-sm">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-50 text-accent-600">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-5 text-xl font-semibold text-surface-900">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-surface-600">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-700">Workflow</p>
            <h2 className="mt-3 text-3xl font-bold text-surface-900">From setup to client proof in three tight moves.</h2>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {workflow.map((item) => (
              <div key={item.step} className="rounded-[28px] border border-surface-200 bg-surface-50 p-6">
                <div className="inline-flex rounded-full bg-primary-600 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white">
                  {item.step}
                </div>
                <h3 className="mt-5 text-xl font-semibold text-surface-900">{item.title}</h3>
                <p className="mt-3 text-sm leading-6 text-surface-600">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-700">Feature set</p>
          <h2 className="mt-3 text-3xl font-bold text-surface-900">One premium suite, organized around agency delivery.</h2>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {features.map(({ title, body, icon: Icon }) => (
            <div key={title} className="rounded-[28px] border border-surface-200 bg-white p-6 shadow-sm">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-600">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-5 text-xl font-semibold text-surface-900">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-surface-600">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-surface-100 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-700">Pricing</p>
            <h2 className="mt-3 text-3xl font-bold text-surface-900">Per-agency pricing with client-site limits built in.</h2>
          </div>
          <div className="mt-10 grid gap-5 xl:grid-cols-3">
            {PLAN_CATALOG.map((tier) => (
              <div
                key={tier.id}
                className={`rounded-[28px] border p-6 shadow-sm ${
                  tier.highlight
                    ? 'border-primary-300 bg-white ring-2 ring-primary-300'
                    : 'border-surface-200 bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-2xl font-semibold text-surface-900">{tier.name}</h3>
                    <p className="mt-3 text-sm leading-6 text-surface-600">{tier.description}</p>
                  </div>
                  {tier.highlight && (
                    <div className="rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary-700">
                      Best fit
                    </div>
                  )}
                </div>
                <div className="mt-6 flex items-end gap-2">
                  <span className="text-4xl font-bold text-surface-900">
                    {tier.priceEtb === 0 ? 'Free' : `${tier.priceEtb.toLocaleString()} ETB`}
                  </span>
                  {tier.priceEtb > 0 && <span className="pb-1 text-sm text-surface-500">/ month</span>}
                </div>
                <div className="mt-6 space-y-3">
                  {tier.features.map((feature) => (
                    <div key={feature} className="flex items-start gap-2 text-sm text-surface-700">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
                <Link
                  to="/signup"
                  className={`mt-8 inline-flex w-full items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                    tier.highlight
                      ? 'bg-primary-600 text-white hover:bg-primary-700'
                      : 'bg-surface-900 text-white hover:bg-surface-950'
                  }`}
                >
                  Start free
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[32px] border border-surface-200 bg-white p-8 shadow-sm">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary-700">
              <ShieldCheck className="h-3.5 w-3.5" />
              Built for this market
            </div>
            <h2 className="mt-4 text-3xl font-bold text-surface-900">Local operating assumptions matter.</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {[
                { icon: Globe2, title: 'Ethiopian traffic realities', body: 'Bandwidth-aware tracking and practical reporting for mobile-first traffic patterns.' },
                { icon: BarChart3, title: 'Agency-first reporting', body: 'The product is organized around portfolio management and account delivery, not isolated single-site dashboards.' },
                { icon: Bot, title: 'Telegram-native alerts', body: 'Push issues into the channel your team actually uses instead of hiding them in an inbox.' },
                { icon: Sparkles, title: 'DXM Pulse AI next', body: 'The AI layer is documented as the next upgrade on top of overview, alerts, funnels, and reports.' },
              ].map(({ icon: Icon, title, body }) => (
                <div key={title} className="rounded-3xl bg-surface-50 p-5">
                  <Icon className="h-5 w-5 text-primary-600" />
                  <h3 className="mt-4 text-lg font-semibold text-surface-900">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-surface-600">{body}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[32px] border border-primary-200 bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 p-8 text-white shadow-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-100">Call to action</p>
            <h2 className="mt-4 text-3xl font-bold">See how DXM Pulse feels when it is actually organized around agency work.</h2>
            <p className="mt-4 text-sm leading-7 text-primary-100">
              Start with the demo. If the experience feels right, create a workspace and connect your first client site.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/demo"
                className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-primary-900 transition hover:bg-primary-50"
              >
                View demo <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/signup"
                className="inline-flex items-center gap-2 rounded-2xl border border-white/20 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Start free
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
