import { Logo, buttonClass, cx } from '@pulse/ui';
import { Link, useNavigate } from '@tanstack/react-router';
import { Check } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { HealthRing } from '../components/pulse';

const wrap = 'mx-auto w-full max-w-[75rem] px-4 sm:px-8 lg:px-12';

/** Public front door: positioning, the free Health Check, how it works, agencies, pricing. */
export function LandingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [site, setSite] = useState('');
  const check = (e: FormEvent) => {
    e.preventDefault();
    void navigate({ to: '/sign-up' });
  };

  return (
    <div className="min-h-dvh">
      <header className={cx(wrap, 'flex flex-wrap items-center gap-x-7 gap-y-3 py-5')}>
        <Link
          to="/"
          className="rounded-md outline-none focus-visible:outline-3 focus-visible:outline-primary"
        >
          <Logo />
        </Link>
        <nav aria-label={t('landing.nav')} className="hidden gap-6 text-[0.9375rem] md:flex">
          <a href="#how" className="text-text hover:text-primary">
            {t('landing.navHow')}
          </a>
          <a href="#agencies" className="text-text hover:text-primary">
            {t('landing.navAgencies')}
          </a>
          <a href="#pricing" className="text-text hover:text-primary">
            {t('landing.navPricing')}
          </a>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <LanguageSwitch />
          <Link to="/sign-in" className={buttonClass('ghost')}>
            {t('auth.signIn.submit')}
          </Link>
          <Link
            to="/sign-up"
            className={cx(buttonClass('primary'), 'bg-text text-bg data-[hovered]:bg-text')}
          >
            {t('landing.start')}
          </Link>
        </div>
      </header>

      <main id="main">
        <section
          className={cx(
            wrap,
            'grid items-center gap-12 pt-12 pb-16 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:pt-20',
          )}
        >
          <div className="grid gap-6">
            <span className="w-fit rounded-full bg-primary-soft px-3 py-1.5 text-sm font-semibold text-primary">
              {t('landing.eyebrow')}
            </span>
            <h1 className="font-display text-[clamp(2.375rem,1.4rem+4vw,4.25rem)] leading-[1.02] font-bold tracking-[-0.035em] text-balance [:lang(am)_&]:text-[clamp(2rem,1.3rem+2.4vw,3.25rem)] [:lang(am)_&]:leading-[1.3] [:lang(am)_&]:tracking-normal">
              {t('landing.title')}
            </h1>
            <p className="max-w-xl text-[clamp(1.0625rem,1rem+0.4vw,1.25rem)] leading-relaxed text-text-muted">
              {t('landing.lede')}
            </p>
            <form
              onSubmit={check}
              className="flex max-w-xl flex-wrap gap-2"
              aria-label={t('landing.checkLabel')}
            >
              <label htmlFor="hc-site" className="sr-only">
                {t('landing.siteLabel')}
              </label>
              <input
                id="hc-site"
                type="url"
                inputMode="url"
                lang="en"
                value={site}
                onChange={(e) => setSite(e.target.value)}
                placeholder="yourshop.et"
                className="min-h-14 min-w-0 flex-[1_1_14rem] rounded-lg border-[1.5px] border-border-strong bg-surface px-4.5 text-[1.0625rem] outline-none focus:border-primary focus:ring-3 focus:ring-primary-soft"
              />
              <button
                type="submit"
                className={cx(buttonClass('primary'), 'min-h-14 flex-auto rounded-lg px-6 text-base')}
              >
                {t('landing.check')}
              </button>
            </form>
            <span className="text-sm text-text-muted">{t('landing.checkNote')}</span>
          </div>

          <div className="grid gap-4.5 rounded-xl border border-border bg-surface p-6 sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[0.8125rem] text-text-muted" lang="en">
                {t('landing.example')} · yourshop.et
              </span>
              <span className="rounded-sm bg-surface-sunken px-2 py-0.5 text-xs text-text-muted">
                {t('sample.label')}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <HealthRing score={58} size={72} label={t('metric.healthOf', { score: 58 })} />
              <div className="grid gap-1">
                <span className="text-lg font-semibold">{t('landing.exampleTitle')}</span>
                <span className="text-sm text-text-muted">{t('landing.exampleLoad')}</span>
              </div>
            </div>
            <ol className="grid gap-2.5">
              {[1, 2, 3].map((n) => (
                <li
                  key={n}
                  className={cx(
                    'flex gap-3 rounded-md p-3.5 text-[0.9375rem]',
                    n === 1 ? 'bg-bad-bg' : 'bg-warn-bg',
                  )}
                >
                  <span className={cx('font-bold', n === 1 ? 'text-bad' : 'text-warn')}>{n}</span>
                  {t(`landing.issue.${n}`)}
                </li>
              ))}
            </ol>
            <Link to="/sign-up" className={cx(buttonClass('secondary'), 'min-h-12')}>
              {t('landing.watch')} →
            </Link>
          </div>
        </section>

        <section id="how" className="border-y border-border bg-surface">
          <div className={cx(wrap, 'grid gap-10 py-18')}>
            <h2 className="max-w-xl font-display text-[clamp(1.75rem,1.2rem+1.8vw,2.5rem)] leading-tight font-bold tracking-[-0.02em]">
              {t('landing.howTitle')}
            </h2>
            <div className="grid gap-8 md:grid-cols-3">
              {[1, 2, 3].map((n) => (
                <div key={n} className="grid content-start gap-2.5">
                  <span className="font-display text-[2.5rem] font-bold text-primary">0{n}</span>
                  <h3 className="text-lg font-semibold">{t(`landing.how.${n}.title`)}</h3>
                  <p className="leading-relaxed text-text-muted">{t(`landing.how.${n}.body`)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="agencies" className={cx(wrap, 'grid items-center gap-10 py-18 lg:grid-cols-2')}>
          <div className="grid gap-4">
            <span className="text-sm font-semibold text-primary">{t('landing.agencies.eyebrow')}</span>
            <h2 className="font-display text-[clamp(1.75rem,1.2rem+1.8vw,2.5rem)] leading-tight font-bold tracking-[-0.02em]">
              {t('landing.agencies.title')}
            </h2>
            <p className="text-[1.0625rem] leading-relaxed text-text-muted">{t('landing.agencies.body')}</p>
          </div>
          <ul className="grid">
            {[1, 2, 3, 4].map((n) => (
              <li key={n} className="flex items-center gap-3.5 border-b border-border py-4 last:border-b-0">
                <Check size={20} aria-hidden="true" className="shrink-0 text-good" />
                {t(`landing.agencies.${n}`)}
              </li>
            ))}
          </ul>
        </section>

        <section id="pricing" className="bg-surface-sunken">
          <div className={cx(wrap, 'grid gap-8 py-18')}>
            <div className="grid gap-2.5">
              <h2 className="font-display text-[clamp(1.75rem,1.2rem+1.8vw,2.5rem)] leading-tight font-bold tracking-[-0.02em]">
                {t('landing.pricing.title')}
              </h2>
              <p className="text-text-muted">{t('landing.pricing.body')}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {(['free', 'business', 'agency', 'care'] as const).map((p) => (
                <div
                  key={p}
                  className={cx(
                    'grid content-start gap-2.5 rounded-lg p-6',
                    p === 'care'
                      ? 'bg-text text-bg'
                      : p === 'business'
                        ? 'border-2 border-primary bg-surface'
                        : 'border border-border bg-surface',
                  )}
                >
                  <h3 className="text-[1.0625rem] font-semibold">{t(`landing.plan.${p}.name`)}</h3>
                  <span className="text-[1.75rem] font-bold tracking-[-0.02em]">
                    {t(`landing.plan.${p}.price`)}
                  </span>
                  <span
                    className={cx('text-sm leading-relaxed', p === 'care' ? 'opacity-80' : 'text-text-muted')}
                  >
                    {t(`landing.plan.${p}.body`)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className={cx(wrap, 'flex flex-wrap gap-x-7 gap-y-2 py-8 text-sm text-text-muted')}>
        <span>{t('landing.footer')}</span>
        <Link to="/sign-in" className="hover:text-text">
          {t('auth.signIn.submit')}
        </Link>
      </footer>
    </div>
  );
}
