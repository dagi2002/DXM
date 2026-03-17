import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Zap,
  Eye,
  TrendingDown,
  Clock,
  Play,
  Bell,
  Gauge,
  Code,
  BarChart3,
  CheckCircle2,
  Globe,
  Wifi,
  Shield,
  Check,
} from 'lucide-react';
import { SiteAudit } from '../components/Landing/SiteAudit';

/* ─── Language Toggle ──────────────────────────────────────────────────────── */
const LanguageToggle: React.FC = () => {
  const { i18n } = useTranslation();
  const current = i18n.language;

  const toggle = () => {
    i18n.changeLanguage(current === 'am' ? 'en' : 'am');
  };

  return (
    <button
      onClick={toggle}
      className="rounded-lg border border-white/30 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-white/10"
    >
      {current === 'am' ? 'EN' : '\u12A0\u121B'}
    </button>
  );
};

/* ─── Pricing Data ─────────────────────────────────────────────────────────── */
interface PricingTier {
  nameKey: string;
  price: string;
  period?: string;
  popular?: boolean;
  featuresKeys: string[];
  ctaKey: string;
  ctaTo: string;
}

const pricingTiers: PricingTier[] = [
  {
    nameKey: 'landing.pricingFreeName',
    price: '0 ETB',
    featuresKeys: [
      'landing.pricingFreeF1',
      'landing.pricingFreeF2',
      'landing.pricingFreeF3',
      'landing.pricingFreeF4',
    ],
    ctaKey: 'landing.pricingFreeCta',
    ctaTo: '/signup',
  },
  {
    nameKey: 'landing.pricingStarterName',
    price: '499 ETB',
    period: '/mo',
    popular: true,
    featuresKeys: [
      'landing.pricingStarterF1',
      'landing.pricingStarterF2',
      'landing.pricingStarterF3',
      'landing.pricingStarterF4',
      'landing.pricingStarterF5',
    ],
    ctaKey: 'landing.pricingStarterCta',
    ctaTo: '/signup',
  },
  {
    nameKey: 'landing.pricingProName',
    price: '1,499 ETB',
    period: '/mo',
    featuresKeys: [
      'landing.pricingProF1',
      'landing.pricingProF2',
      'landing.pricingProF3',
      'landing.pricingProF4',
      'landing.pricingProF5',
      'landing.pricingProF6',
    ],
    ctaKey: 'landing.pricingProCta',
    ctaTo: '/signup',
  },
];

/* ─── Landing Page ─────────────────────────────────────────────────────────── */
export const LandingPage: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-surface-50 text-surface-900">
      {/* ── Navbar ──────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-primary-700/20 bg-primary-600/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2 text-white">
            <Zap className="h-7 w-7" />
            <span className="text-xl font-bold tracking-tight">DXM Pulse</span>
          </Link>

          <div className="flex items-center gap-3">
            <LanguageToggle />
            <Link
              to="/demo"
              className="hidden rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10 sm:inline-block"
            >
              {t('landing.viewDemo')}
            </Link>
            <Link
              to="/signup"
              className="rounded-lg bg-accent-600 px-5 py-2 text-sm font-bold text-white shadow-lg transition hover:bg-accent-700"
            >
              {t('landing.startFree')}
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary-600 to-primary-700">
        {/* Subtle dot pattern */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'radial-gradient(circle, #fff 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />

        <div className="relative mx-auto max-w-4xl px-4 py-24 text-center sm:py-32 lg:py-40">
          <h1 className="text-4xl font-extrabold leading-tight text-white sm:text-5xl lg:text-6xl">
            {t('landing.heroTitle')}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-white/80 sm:text-xl">
            {t('landing.heroSubtitle')}
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              to="/signup"
              className="rounded-xl bg-accent-600 px-8 py-3.5 text-lg font-bold text-white shadow-xl transition hover:bg-accent-700 hover:shadow-2xl"
            >
              {t('landing.startFree')}
            </Link>
            <Link
              to="/demo"
              className="rounded-xl border-2 border-white/40 px-8 py-3.5 text-lg font-bold text-white transition hover:bg-white/10"
            >
              {t('landing.viewDemo')}
            </Link>
          </div>
        </div>
      </section>

      {/* ── Site Audit ──────────────────────────────────────────────────────── */}
      <section className="relative -mt-12 z-10 mx-auto max-w-2xl px-4">
        <SiteAudit />
      </section>

      {/* ── Problem Statement ──────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:py-28">
        <h2 className="text-center text-3xl font-bold text-surface-900 sm:text-4xl">
          {t('landing.problemTitle')}
        </h2>

        <div className="mt-14 grid gap-8 sm:grid-cols-3">
          {[
            { Icon: Eye, titleKey: 'landing.problem1Title', descKey: 'landing.problem1Desc' },
            { Icon: TrendingDown, titleKey: 'landing.problem2Title', descKey: 'landing.problem2Desc' },
            { Icon: Clock, titleKey: 'landing.problem3Title', descKey: 'landing.problem3Desc' },
          ].map(({ Icon, titleKey, descKey }) => (
            <div
              key={titleKey}
              className="rounded-2xl border border-surface-200 bg-white p-8 text-center shadow-sm transition hover:shadow-md"
            >
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-red-50 text-red-500">
                <Icon className="h-7 w-7" />
              </div>
              <h3 className="mt-5 text-lg font-semibold">{t(titleKey)}</h3>
              <p className="mt-2 text-surface-600">{t(descKey)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────────────────────── */}
      <section className="bg-surface-100 py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-3xl font-bold sm:text-4xl">
            {t('landing.featuresTitle')}
          </h2>

          <div className="mt-14 grid gap-8 sm:grid-cols-3">
            {[
              { Icon: Play, titleKey: 'landing.feature1Title', descKey: 'landing.feature1Desc' },
              { Icon: Bell, titleKey: 'landing.feature2Title', descKey: 'landing.feature2Desc' },
              { Icon: Gauge, titleKey: 'landing.feature3Title', descKey: 'landing.feature3Desc' },
            ].map(({ Icon, titleKey, descKey }) => (
              <div
                key={titleKey}
                className="rounded-2xl bg-white p-8 shadow-sm transition hover:shadow-md"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="mt-5 text-xl font-semibold">{t(titleKey)}</h3>
                <p className="mt-2 leading-relaxed text-surface-600">
                  {t(descKey)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ───────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-4 py-20 sm:py-28">
        <h2 className="text-center text-3xl font-bold sm:text-4xl">
          {t('landing.howTitle')}
        </h2>

        <div className="mt-14 grid gap-10 sm:grid-cols-3">
          {[
            { Icon: Code, stepKey: 'landing.step1Title', descKey: 'landing.step1Desc', num: 1 },
            { Icon: BarChart3, stepKey: 'landing.step2Title', descKey: 'landing.step2Desc', num: 2 },
            { Icon: CheckCircle2, stepKey: 'landing.step3Title', descKey: 'landing.step3Desc', num: 3 },
          ].map(({ Icon, stepKey, descKey, num }) => (
            <div key={stepKey} className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary-600 text-white text-xl font-bold shadow-lg">
                {num}
              </div>
              <div className="mx-auto mt-4 flex h-10 w-10 items-center justify-center text-primary-600">
                <Icon className="h-6 w-6" />
              </div>
              <h3 className="mt-3 text-lg font-semibold">{t(stepKey)}</h3>
              <p className="mt-2 text-surface-600">{t(descKey)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing ────────────────────────────────────────────────────────── */}
      <section className="bg-surface-100 py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-3xl font-bold sm:text-4xl">
            {t('landing.pricingTitle')}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-surface-600">
            {t('landing.pricingSubtitle')}
          </p>

          <div className="mt-14 grid gap-8 sm:grid-cols-3">
            {pricingTiers.map((tier) => (
              <div
                key={tier.nameKey}
                className={`relative rounded-2xl bg-white p-8 shadow-sm transition hover:shadow-md ${
                  tier.popular ? 'ring-2 ring-accent-600' : ''
                }`}
              >
                {tier.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent-600 px-4 py-1 text-xs font-bold uppercase tracking-wide text-white">
                    {t('landing.popular')}
                  </span>
                )}

                <h3 className="text-lg font-semibold text-surface-900">
                  {t(tier.nameKey)}
                </h3>
                <div className="mt-4">
                  <span className="text-4xl font-extrabold text-surface-900">
                    {tier.price}
                  </span>
                  {tier.period && (
                    <span className="text-surface-500">{tier.period}</span>
                  )}
                </div>

                <ul className="mt-6 space-y-3">
                  {tier.featuresKeys.map((fk) => (
                    <li key={fk} className="flex items-start gap-2 text-surface-700">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" />
                      <span>{t(fk)}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  to={tier.ctaTo}
                  className={`mt-8 block w-full rounded-xl py-3 text-center font-bold transition ${
                    tier.popular
                      ? 'bg-accent-600 text-white hover:bg-accent-700'
                      : 'bg-surface-100 text-surface-900 hover:bg-surface-200'
                  }`}
                >
                  {t(tier.ctaKey)}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Trust Section ──────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:py-28">
        <h2 className="text-center text-3xl font-bold sm:text-4xl">
          {t('landing.trustTitle')}
        </h2>

        <div className="mt-14 grid gap-8 sm:grid-cols-3">
          {[
            { Icon: Globe, titleKey: 'landing.trust1Title', descKey: 'landing.trust1Desc' },
            { Icon: Wifi, titleKey: 'landing.trust2Title', descKey: 'landing.trust2Desc' },
            { Icon: Shield, titleKey: 'landing.trust3Title', descKey: 'landing.trust3Desc' },
          ].map(({ Icon, titleKey, descKey }) => (
            <div key={titleKey} className="flex flex-col items-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-600">
                <Icon className="h-7 w-7" />
              </div>
              <h3 className="mt-5 text-lg font-semibold">{t(titleKey)}</h3>
              <p className="mt-2 text-surface-600">{t(descKey)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-surface-200 bg-surface-900 py-14 text-surface-300">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:grid-cols-4">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 text-white">
              <Zap className="h-6 w-6" />
              <span className="text-lg font-bold">DXM Pulse</span>
            </div>
            <p className="mt-3 text-sm text-surface-400">
              {t('landing.footerTagline')}
            </p>
          </div>

          {/* Product */}
          <div>
            <h4 className="font-semibold text-white">{t('landing.footerProduct')}</h4>
            <ul className="mt-3 space-y-2 text-sm">
              <li><Link to="/demo" className="transition hover:text-white">{t('landing.footerDemo')}</Link></li>
              <li><Link to="/signup" className="transition hover:text-white">{t('landing.footerPricing')}</Link></li>
              <li><Link to="/demo" className="transition hover:text-white">{t('landing.footerFeatures')}</Link></li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="font-semibold text-white">{t('landing.footerSupport')}</h4>
            <ul className="mt-3 space-y-2 text-sm">
              <li><Link to="/demo" className="transition hover:text-white">{t('landing.footerDocs')}</Link></li>
              <li><Link to="/demo" className="transition hover:text-white">{t('landing.footerContact')}</Link></li>
              <li><Link to="/demo" className="transition hover:text-white">{t('landing.footerStatus')}</Link></li>
            </ul>
          </div>

          {/* Made in Ethiopia */}
          <div className="flex flex-col justify-between">
            <p className="text-sm text-surface-400">
              {t('landing.madeInEthiopia')}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
