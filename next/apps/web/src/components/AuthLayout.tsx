import { Logo } from '@pulse/ui';
import { Link } from '@tanstack/react-router';
import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { LanguageSwitch } from './LanguageSwitch';

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* Brand panel — desktop only, so phones on slow data go straight to the form. */}
      <aside className="hidden flex-col justify-between bg-primary p-12 text-on-primary lg:flex xl:p-16">
        <Logo className="text-on-primary [&>span:first-child]:bg-on-primary [&>span:first-child]:text-primary" />
        <div className="grid max-w-md gap-8">
          <p className="font-display text-[clamp(2rem,1.2rem+1.8vw,3rem)] leading-[1.08] font-bold tracking-[-0.03em] text-balance">
            {t('app.tagline')}
          </p>
          <ul className="grid gap-3.5 text-base">
            {[1, 2, 3].map((n) => (
              <li key={n} className="flex items-start gap-3">
                <Check size={20} aria-hidden="true" className="mt-0.5 shrink-0 opacity-80" />
                {t(`auth.side.${n}`)}
              </li>
            ))}
          </ul>
        </div>
        <span aria-hidden="true" />
      </aside>

      <div className="flex min-h-dvh flex-col">
        <header className="flex items-center justify-between px-4 py-4 sm:px-8">
          <Link
            to="/"
            className="rounded-md outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary lg:invisible"
          >
            <Logo />
          </Link>
          <LanguageSwitch />
        </header>
        <main
          id="main"
          className="flex flex-1 items-start justify-center px-4 pt-6 pb-16 sm:items-center sm:pt-0"
        >
          <div className="w-full max-w-sm">
            <h1 className="font-display text-[2rem] leading-tight font-bold tracking-[-0.02em]">{title}</h1>
            {subtitle ? <p className="mt-2 text-[0.9375rem] text-text-muted">{subtitle}</p> : null}
            <div className="mt-8">{children}</div>
            {footer ? <div className="mt-6 text-sm text-text-muted">{footer}</div> : null}
          </div>
        </main>
        <footer className="px-4 pb-6 text-center text-xs text-text-faint lg:hidden">
          {t('app.tagline')}
        </footer>
      </div>
    </div>
  );
}

export function TextLink({
  to,
  children,
  search,
}: {
  to: string;
  children: ReactNode;
  search?: Record<string, string>;
}) {
  return (
    <Link
      to={to}
      search={search as never}
      className="font-semibold text-primary underline-offset-4 outline-none hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      {children}
    </Link>
  );
}
