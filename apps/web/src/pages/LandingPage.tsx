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
  TrendingUp,
  Activity,
  Brain,
  MessageSquare,
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
    title: 'Reporting is too reactive and time-consuming',
    body: 'Most agencies scramble at week\'s end to explain traffic and conversions instead of monitoring the story as it unfolds.',
    icon: Clock3,
  },
  {
    title: 'Too many tools, not enough operational clarity',
    body: 'Analytics, replay, and alerts live in different places, so your team loses hours switching contexts instead of solving issues.',
    icon: Eye,
  },
];

const features = [
  {
    title: 'Portfolio command center',
    body: 'See every client site, its health score, recent activity, and at-risk accounts in one coherent agency overview.',
    icon: Building2,
  },
  {
    title: 'Session replay & behavioral insight',
    body: 'Show clients how real visitors moved, hesitated, clicked, and dropped out — replacing guesswork with proof.',
    icon: PlayCircle,
  },
  {
    title: 'Alert-led account management',
    body: 'Catch issues before clients do, send Telegram digests, and turn raw signals into proactive status updates.',
    icon: Bot,
  },
  {
    title: 'AI Portfolio Brief',
    body: 'DXM Pulse AI reads your full portfolio and generates a natural-language weekly narrative ready to share with clients.',
    icon: Brain,
  },
  {
    title: 'Funnel & conversion analysis',
    body: 'Map every step of your client\'s conversion flow, identify where visitors drop, and show the ROI of every fix.',
    icon: TrendingUp,
  },
  {
    title: 'Real-time performance monitoring',
    body: 'Web Vitals, page weight, response times — all tracked continuously so you never get surprised at a client call.',
    icon: Activity,
  },
];

const workflow = [
  {
    step: '01',
    title: 'Add client sites in minutes',
    body: 'Create a client record, choose your platform (HTML, WordPress, or React), copy the lightweight snippet, and verify installation without leaving the product.',
  },
  {
    step: '02',
    title: 'Monitor the portfolio like an operator',
    body: 'Watch health, alerts, replay, funnels, and performance from one coherent agency command center — live, at a glance.',
  },
  {
    step: '03',
    title: 'Turn insight into client-facing proof',
    body: 'Use AI-generated summaries and weekly narratives that make your work visible, measurable, and worth renewing.',
  },
];

const footerLinks = {
  Product: [
    { label: 'Overview', href: '/demo' },
    { label: 'Session Replay', href: '/demo' },
    { label: 'AI Portfolio Brief', href: '/demo' },
    { label: 'Alerts', href: '/demo' },
    { label: 'Pricing', href: '/#pricing' },
  ],
  Company: [
    { label: 'About DXM Pulse', href: '#' },
    { label: 'Blog', href: '#' },
    { label: 'Contact', href: '#' },
  ],
  Resources: [
    { label: 'Documentation', href: '#' },
    { label: 'Install guide', href: '#' },
    { label: 'SDK reference', href: '#' },
    { label: 'API reference', href: '#' },
  ],
};

export const LandingPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-surface-50 text-surface-900">
      {/* ── Nav ── */}
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

          <div className="hidden items-center gap-6 sm:flex">
            <Link to="/demo" className="text-sm font-medium text-surface-600 transition hover:text-surface-900">Demo</Link>
            <a href="#pricing" className="text-sm font-medium text-surface-600 transition hover:text-surface-900">Pricing</a>
            <Link to="/login" className="text-sm font-medium text-surface-600 transition hover:text-surface-900">Sign in</Link>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/demo"
              className="hidden rounded-2xl bg-surface-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-surface-950 sm:inline-flex"
            >
              View demo
            </Link>
            <Link
              to="/signup"
              className="inline-flex items-center gap-2 rounded-2xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-700"
            >
              Start free <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(22,101,52,0.16),_transparent_38%),radial-gradient(circle_at_bottom_right,_rgba(217,119,6,0.14),_transparent_32%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-24">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-primary-700">
              <Sparkles className="h-3.5 w-3.5" />
              Ethiopia's first AI-powered DXM platform
            </div>
            <h1 className="mt-6 text-4xl font-bold leading-tight tracking-tight text-surface-900 md:text-6xl">
              Monitor all your client websites from one operational command center.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-surface-600">
              Catch issues before clients do, prove the value of your work with AI-generated narratives and session replay, and run a cleaner reporting operation across the whole portfolio.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/demo"
                className="inline-flex items-center gap-2 rounded-2xl bg-surface-900 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-surface-950"
              >
                View live demo <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/signup"
                className="inline-flex items-center gap-2 rounded-2xl border border-surface-300 bg-white px-6 py-3.5 text-sm font-semibold text-surface-900 transition hover:border-primary-300 hover:text-primary-700"
              >
                Start free — no card needed
              </Link>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {[
                { label: 'Portfolio health', value: '81/100', note: 'live agency benchmark' },
                { label: 'Client sites', value: '30+', note: 'per workspace on starter' },
                { label: 'Report prep time', value: '< 10 min', note: 'AI-generated narrative' },
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

              {/* AI brief preview */}
              <div className="mt-6 rounded-3xl border border-white/10 bg-white/10 p-5 backdrop-blur">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-primary-100" />
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-100">AI portfolio brief</p>
                </div>
                <p className="mt-3 text-sm leading-7 text-primary-50">
                  Three client sites need follow-up before the next check-in. One checkout flow is slowing on mobile, while your strongest retail client improved conversion again after the last landing page fix.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Live site audit ── */}
      <section className="mx-auto max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
        <div className="rounded-[32px] border border-surface-200 bg-white p-6 shadow-sm md:p-8">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-700">Try it now</p>
            <h2 className="mt-3 text-3xl font-bold text-surface-900">Run a 60-second site audit before you sign up.</h2>
            <p className="mt-3 text-sm leading-6 text-surface-600">
              Get an immediate read on response time, mobile readiness, and page weight — no account needed.
            </p>
          </div>
          <div className="mt-8">
            <SiteAudit />
          </div>
        </div>
      </section>

      {/* ── Pain points ── */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-700">Why agencies need this</p>
          <h2 className="mt-3 text-3xl font-bold text-surface-900">Built for agencies carrying the operational risk of client websites.</h2>
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

      {/* ── Workflow ── */}
      <section className="bg-white py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-700">How it works</p>
            <h2 className="mt-3 text-3xl font-bold text-surface-900">From signup to client proof in three tight moves.</h2>
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

      {/* ── Feature set ── */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-700">Feature set</p>
          <h2 className="mt-3 text-3xl font-bold text-surface-900">One premium suite, organized around agency delivery.</h2>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
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

      {/* ── AI Feature highlight ── */}
      <section className="bg-gradient-to-br from-primary-950 via-primary-900 to-primary-800 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div className="text-white">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-primary-200">
                <Brain className="h-3.5 w-3.5" />
                DXM Pulse AI
              </div>
              <h2 className="mt-5 text-3xl font-bold leading-tight text-white md:text-4xl">
                Your agency narrative, written automatically every week.
              </h2>
              <p className="mt-4 text-base leading-7 text-primary-200">
                DXM Pulse AI reads your entire portfolio — sessions, health scores, alerts, funnel performance — and generates a natural-language weekly brief your team can act on or send directly to clients.
              </p>
              <div className="mt-8 space-y-4">
                {[
                  { icon: TrendingUp, text: 'Portfolio health trend with client-by-client breakdown' },
                  { icon: AlertTriangle, text: 'Risk signals ranked by severity and urgency' },
                  { icon: MessageSquare, text: 'Client-ready narrative in English or Amharic' },
                  { icon: Activity, text: 'Recommended next actions with clear rationale' },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-start gap-3">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-600">
                      <Icon className="h-3.5 w-3.5 text-white" />
                    </div>
                    <p className="text-sm leading-6 text-primary-100">{text}</p>
                  </div>
                ))}
              </div>
              <Link
                to="/signup"
                className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-white px-6 py-3.5 text-sm font-semibold text-primary-900 transition hover:bg-primary-50"
              >
                Try DXM Pulse AI free <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="rounded-[28px] border border-white/15 bg-white/10 p-6 backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary-300" />
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-200">AI portfolio brief — this week</p>
                </div>
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">LIVE</span>
              </div>
              <h3 className="mt-4 text-xl font-semibold text-white">2 client sites need attention before Friday's check-in.</h3>
              <p className="mt-3 text-sm leading-7 text-primary-200">
                DXM Pulse recorded 1,840 sessions across your portfolio this week. Abebe Furniture is your top performer at 87/100. Habesha Legal Studio has a high-severity rage-click alert on mobile checkout that should be resolved before the next client call.
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {[
                  { label: 'Top risk', value: 'Rage clicks on checkout CTA', tone: 'warning' },
                  { label: 'Top opportunity', value: 'Abebe Furniture — anchor proof conversations', tone: 'positive' },
                  { label: 'Action', value: 'Fix mobile CTA and share weekly summary', tone: 'neutral' },
                ].map(({ label, value, tone }) => (
                  <div key={label} className={`rounded-2xl p-3 ${
                    tone === 'warning' ? 'bg-amber-500/15 border border-amber-400/20' :
                    tone === 'positive' ? 'bg-emerald-500/15 border border-emerald-400/20' :
                    'bg-white/10 border border-white/10'
                  }`}>
                    <p className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${
                      tone === 'warning' ? 'text-amber-300' :
                      tone === 'positive' ? 'text-emerald-300' :
                      'text-primary-300'
                    }`}>{label}</p>
                    <p className="mt-2 text-xs leading-5 text-white">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="bg-surface-100 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-700">Pricing</p>
            <h2 className="mt-3 text-3xl font-bold text-surface-900">Per-agency pricing with client-site limits built in.</h2>
            <p className="mt-3 text-sm text-surface-600">Priced in Ethiopian Birr. Includes AI portfolio briefs on all plans.</p>
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
                  className={`mt-8 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                    tier.highlight
                      ? 'bg-primary-600 text-white hover:bg-primary-700'
                      : 'bg-surface-900 text-white hover:bg-surface-950'
                  }`}
                >
                  {tier.priceEtb === 0 ? 'Start free' : 'Get started'}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Local market + CTA ── */}
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
                { icon: BarChart3, title: 'Agency-first reporting', body: 'Organized around portfolio management and account delivery, not single-site dashboards.' },
                { icon: Bot, title: 'Telegram-native alerts', body: 'Push issues into the channel your team actually uses instead of hiding them in an inbox.' },
                { icon: Brain, title: 'DXM Pulse AI', body: 'AI portfolio briefs, intelligent alert analysis, and a weekly narrative engine — all included.' },
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
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-100">Start today</p>
            <h2 className="mt-4 text-3xl font-bold">See how DXM Pulse feels when it is actually organized around agency work.</h2>
            <p className="mt-4 text-sm leading-7 text-primary-100">
              Start with the demo. If it feels right, create a workspace and connect your first client site in under five minutes.
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

      {/* ── Footer ── */}
      <footer className="border-t border-surface-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid gap-8 md:grid-cols-[1.5fr_repeat(3,_1fr)]">
            {/* Brand */}
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary-600 to-primary-800 shadow-md">
                  <Zap className="h-4 w-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-bold text-surface-900">DXM Pulse</p>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-surface-400">Agency Suite</p>
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-surface-500">
                The first Digital Experience Management platform built for Ethiopian agencies. Monitor, analyze, and prove your value — all in one place.
              </p>
              <div className="mt-5 flex items-center gap-2">
                <div className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                  Addis Ababa, Ethiopia
                </div>
              </div>
            </div>

            {/* Link groups */}
            {Object.entries(footerLinks).map(([group, links]) => (
              <div key={group}>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-surface-500">{group}</p>
                <ul className="mt-4 space-y-3">
                  {links.map(({ label, href }) => (
                    <li key={label}>
                      <Link to={href} className="text-sm text-surface-600 transition hover:text-surface-900">
                        {label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-surface-100 pt-8 sm:flex-row">
            <p className="text-xs text-surface-400">
              © {new Date().getFullYear()} DXM Pulse · All rights reserved
            </p>
            <div className="flex items-center gap-4">
              <Link to="#" className="text-xs text-surface-400 hover:text-surface-600">Privacy Policy</Link>
              <Link to="#" className="text-xs text-surface-400 hover:text-surface-600">Terms of Service</Link>
              <Link to="#" className="text-xs text-surface-400 hover:text-surface-600">Cookie Policy</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};
