import { Logo } from '@pulse/ui';
import { Link } from '@tanstack/react-router';
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
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-4 py-4 sm:px-8">
        <Link
          to="/"
          className="rounded-md outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary"
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
          <h1 className="font-display text-[1.75rem] leading-tight font-bold tracking-tight">{title}</h1>
          {subtitle ? <p className="mt-1.5 text-[0.9375rem] text-text-muted">{subtitle}</p> : null}
          <div className="mt-7">{children}</div>
          {footer ? <div className="mt-6 text-sm text-text-muted">{footer}</div> : null}
        </div>
      </main>
      <footer className="px-4 pb-6 text-center text-xs text-text-faint">{t('app.tagline')}</footer>
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
