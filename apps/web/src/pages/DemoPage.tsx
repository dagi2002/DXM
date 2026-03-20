import React from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Building2,
  CheckCircle2,
  Clock3,
  Eye,
  FileText,
  Gauge,
  PlayCircle,
  Zap,
} from 'lucide-react';

const demoClients = [
  {
    name: 'Abebe Furniture',
    domain: 'abebefurniture.et',
    health: 87,
    alerts: 0,
    sessions: 1840,
    note: 'Landing pages improved after the mobile hero refresh.',
  },
  {
    name: 'Blue Nile Tours',
    domain: 'blueniletours.com',
    health: 74,
    alerts: 2,
    sessions: 932,
    note: 'Checkout assistance CTA is driving stronger inquiry completion.',
  },
  {
    name: 'Habesha Legal Studio',
    domain: 'habeshalegal.com',
    health: 51,
    alerts: 3,
    sessions: 418,
    note: 'Mobile landing page is slow and one lead form is underperforming.',
  },
  {
    name: 'Addis Learning Hub',
    domain: 'addislearning.et',
    health: 79,
    alerts: 1,
    sessions: 1264,
    note: 'Course signup flow stabilized after fixing a rage-click step.',
  },
];

const demoAlerts = [
  {
    title: 'Habesha Legal Studio checkout CTA is rage-clicking on mobile',
    detail: 'Users are repeatedly tapping the primary CTA but not progressing. This likely needs a form or navigation fix.',
    severity: 'High',
  },
  {
    title: 'Blue Nile Tours lead form response time crossed 4s',
    detail: 'The account manager should review performance before the next client call.',
    severity: 'Medium',
  },
];

const reportCards = [
  {
    title: 'Weekly portfolio pulse',
    summary: 'Four active clients were monitored this week. Two accounts need follow-up before the next status meetings, while Abebe Furniture is trending positively after last week’s landing page fix.',
  },
  {
    title: 'Habesha Legal Studio risk brief',
    summary: 'The client is underperforming on mobile. Replay and alert evidence point to a broken CTA path and slow page load in the lead flow.',
  },
];

export const DemoPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-surface-50 text-surface-900">
      <nav className="border-b border-surface-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-600 to-primary-800 shadow-lg">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-base font-bold text-surface-900">DXM Pulse</p>
              <p className="text-xs uppercase tracking-[0.18em] text-surface-500">Agency Demo</p>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <Link to="/signup" className="rounded-2xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-700">
              Start free
            </Link>
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-[32px] border border-primary-200 bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 p-6 text-white shadow-xl md:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary-100">
                Demo agency workspace
              </div>
              <h1 className="mt-4 text-4xl font-bold md:text-5xl">Addis Growth Studio portfolio overview</h1>
              <p className="mt-4 text-base leading-7 text-primary-100">
                This demo shows the exact story DXM Pulse should tell in a real agency environment: what is healthy, what is at risk, and what needs to be communicated to clients next.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { label: 'Client sites', value: '18', icon: Building2 },
                { label: 'Portfolio health', value: '81/100', icon: Gauge },
                { label: 'Open alerts', value: '6', icon: AlertTriangle },
                { label: 'Replay sessions', value: '428', icon: Eye },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-primary-100">{label}</p>
                    <Icon className="h-4 w-4 text-primary-100" />
                  </div>
                  <p className="mt-4 text-3xl font-semibold">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-[28px] border border-surface-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-700">Portfolio clients</p>
                <h2 className="mt-2 text-2xl font-semibold text-surface-900">Every client site, one coherent operating view</h2>
              </div>
              <div className="rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary-700">
                Live demo
              </div>
            </div>

            <div className="mt-6 grid gap-4">
              {demoClients.map((client) => (
                <div key={client.name} className="rounded-3xl border border-surface-200 bg-surface-50 p-5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-lg font-semibold text-surface-900">{client.name}</p>
                      <p className="mt-1 text-sm text-surface-500">{client.domain}</p>
                      <p className="mt-3 text-sm leading-6 text-surface-600">{client.note}</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3 md:min-w-[260px]">
                      {[
                        { label: 'Health', value: `${client.health}/100` },
                        { label: 'Alerts', value: client.alerts },
                        { label: 'Sessions', value: client.sessions.toLocaleString() },
                      ].map((stat) => (
                        <div key={stat.label} className="rounded-2xl bg-white px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-surface-500">{stat.label}</p>
                          <p className="mt-2 text-lg font-semibold text-surface-900">{stat.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[28px] border border-surface-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2 text-surface-900">
              <AlertTriangle className="h-5 w-5 text-primary-600" />
              <h2 className="text-2xl font-semibold">Alert posture</h2>
            </div>
            <div className="mt-6 space-y-4">
              {demoAlerts.map((alert) => (
                <div key={alert.title} className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-lg font-semibold text-surface-900">{alert.title}</p>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                      {alert.severity}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-surface-700">{alert.detail}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-3xl border border-surface-200 bg-surface-50 p-5">
              <div className="flex items-center gap-2 text-surface-900">
                <PlayCircle className="h-5 w-5 text-primary-600" />
                <h3 className="text-lg font-semibold">Replay narrative</h3>
              </div>
              <p className="mt-3 text-sm leading-6 text-surface-600">
                One replay session shows five repeated taps on the Habesha Legal Studio CTA before the user abandons the page. The portfolio story becomes instantly clearer when behavior and alerts line up.
              </p>
            </div>
          </section>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <section className="rounded-[28px] border border-surface-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2 text-surface-900">
              <BarChart3 className="h-5 w-5 text-primary-600" />
              <h2 className="text-2xl font-semibold">What this replaces</h2>
            </div>
            <div className="mt-6 space-y-4">
              {[
                'One place to see what is breaking across the portfolio',
                'A cleaner handoff between traffic insight and client communication',
                'Replay, alerts, and performance metrics organized around agency delivery',
                'A more premium product feel than a generic dashboard clone',
              ].map((point) => (
                <div key={point} className="flex items-start gap-3 rounded-3xl bg-surface-50 p-4">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary-600" />
                  <p className="text-sm leading-6 text-surface-700">{point}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[28px] border border-surface-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2 text-surface-900">
              <FileText className="h-5 w-5 text-primary-600" />
              <h2 className="text-2xl font-semibold">Ready-to-share reports</h2>
            </div>
            <div className="mt-6 space-y-4">
              {reportCards.map((report) => (
                <div key={report.title} className="rounded-3xl border border-surface-200 bg-surface-50 p-5">
                  <p className="text-lg font-semibold text-surface-900">{report.title}</p>
                  <p className="mt-3 text-sm leading-6 text-surface-600">{report.summary}</p>
                </div>
              ))}
              <div className="rounded-3xl border border-primary-200 bg-primary-50 p-5">
                <div className="flex items-center gap-2 text-primary-700">
                  <Clock3 className="h-5 w-5" />
                  <p className="text-sm font-semibold uppercase tracking-[0.18em]">Weekly operating rhythm</p>
                </div>
                <p className="mt-3 text-sm leading-6 text-primary-900">
                  The goal is not just pretty analytics. It is to make your agency look more proactive, more organized, and more valuable in every client interaction.
                </p>
              </div>
            </div>
          </section>
        </div>

        <div className="mt-6 rounded-[32px] border border-primary-200 bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 p-6 text-white shadow-xl md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl">
              <h2 className="text-3xl font-bold">If this feels closer to the product you wanted, the next step is to connect a real client site.</h2>
              <p className="mt-3 text-sm leading-7 text-primary-100">
                Create a workspace, install the snippet on one live client site, and let the overview start earning its keep with real traffic.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/signup"
                className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-primary-900 transition hover:bg-primary-50"
              >
                Start free <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/"
                className="inline-flex items-center gap-2 rounded-2xl border border-white/20 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Back to landing
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
