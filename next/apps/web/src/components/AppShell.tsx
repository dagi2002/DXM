import { Banner, Logo, Select, cx } from '@pulse/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { Activity, FileText, Globe, LogOut, PlaySquare, Settings } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button as RACButton } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { authClient } from '../lib/auth-client';
import { useRouteFocus } from '../lib/focus';
import { isNavActive } from '../lib/nav';
import { useMe } from '../lib/queries';
import { LanguageSwitch } from './LanguageSwitch';

/** Only destinations that actually exist are shown (honest UI). More arrive slice by slice. */
const NAV = [
  // A fix opened from the Today feed keeps Today highlighted.
  { to: '/today', key: 'nav.today', icon: Activity, match: ['/today', '/fixes'] },
  { to: '/sites', key: 'nav.sites', icon: Globe, match: ['/sites'] },
  { to: '/replays', key: 'nav.replays', icon: PlaySquare, match: ['/replays'] },
  { to: '/reports', key: 'nav.reports', icon: FileText, match: ['/reports'] },
  { to: '/settings', key: 'nav.settings', icon: Settings, match: ['/settings'] },
] as const;

function useActiveNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (match: readonly string[]) => isNavActive(pathname, match);
}

function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

function OrgSwitcher() {
  const { t } = useTranslation();
  const { me, orgId } = useMe();
  const qc = useQueryClient();
  if (me.orgs.length < 2) {
    return (
      <p className="grid min-w-0 leading-tight">
        <span className="text-xs text-text-muted">{t('nav.workspace')}</span>
        <span className="truncate text-sm font-semibold text-text">
          {me.orgs.find((o) => o.id === orgId)?.name}
        </span>
      </p>
    );
  }
  return (
    <Select
      label={t('nav.switchOrg')}
      selectedKey={orgId}
      options={me.orgs.map((o) => ({ id: o.id, label: o.name }))}
      onSelectionChange={async (id) => {
        await authClient.organization.setActive({ organizationId: id });
        await qc.invalidateQueries();
      }}
    />
  );
}

function SignOutButton({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  return (
    <RACButton
      aria-label={compact ? t('nav.signOut') : undefined}
      onPress={async () => {
        await authClient.signOut();
        qc.clear();
        await navigate({ to: '/sign-in' });
      }}
      className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-sm font-medium text-text-muted outline-none data-[focus-visible]:outline-3 data-[focus-visible]:outline-primary data-[hovered]:bg-surface-sunken data-[hovered]:text-text"
    >
      <LogOut size={18} aria-hidden="true" />
      {compact ? null : t('nav.signOut')}
    </RACButton>
  );
}

const navLinkClass =
  'flex min-h-11 items-center gap-3 rounded-md px-3 text-[0.9375rem] font-medium text-text outline-none transition-colors hover:bg-surface-sunken focus-visible:outline-3 focus-visible:outline-primary';

export function AppShell() {
  const { t } = useTranslation();
  const { me } = useMe();
  const online = useOnline();
  useRouteFocus();
  const isActive = useActiveNav();

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[256px_1fr]">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-on-primary focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        {t('common.skipToContent')}
      </a>

      {/* Desktop rail */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 overflow-y-auto border-r border-border bg-surface px-4 py-5 lg:flex">
        <div className="px-2">
          <Logo />
        </div>
        <div className="rounded-md border border-border bg-bg px-3 py-2.5">
          <OrgSwitcher />
        </div>
        <nav aria-label={t('nav.main')} className="grid gap-0.5">
          {NAV.map(({ to, key, icon: Icon, match }) => (
            <Link
              key={to}
              to={to}
              className={cx(navLinkClass, isActive(match) && 'bg-primary-soft !text-primary font-semibold')}
              aria-current={isActive(match) ? 'page' : undefined}
            >
              <Icon size={20} aria-hidden="true" />
              {t(key)}
            </Link>
          ))}
        </nav>
        {/* grid-cols-1 = minmax(0, 1fr): a long email truncates instead of widening the rail over the page. */}
        <div className="mt-auto grid min-w-0 grid-cols-1 gap-3 rounded-lg bg-surface-sunken p-3">
          <LanguageSwitch persist />
          <div className="flex items-center gap-3 border-t border-border pt-3">
            <span
              aria-hidden="true"
              className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-bold text-primary"
            >
              {me.user.name.trim().charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{me.user.name}</p>
              <p className="truncate text-xs text-text-muted">{me.user.email}</p>
            </div>
            <SignOutButton compact />
          </div>
        </div>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-bg/90 px-4 py-2 backdrop-blur lg:hidden">
          <Logo wordmark={false} />
          <div className="min-w-0 flex-1">
            <OrgSwitcher />
          </div>
          <LanguageSwitch persist />
          <SignOutButton compact />
        </header>

        <main
          id="main"
          tabIndex={-1}
          className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-28 outline-none sm:px-6 lg:px-12 lg:pt-10 lg:pb-14"
        >
          {!online ? (
            <div className="mb-4">
              <Banner tone="warn" title={t('errors.offline')} />
            </div>
          ) : null}
          <Outlet />
        </main>

        {/* Mobile tab bar — always labelled */}
        <nav
          aria-label={t('nav.main')}
          className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-surface pb-[max(env(safe-area-inset-bottom),8px)] lg:hidden"
        >
          {NAV.map(({ to, key, icon: Icon, match }) => (
            <Link
              key={to}
              to={to}
              className={cx(
                'flex min-h-14 flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-semibold text-text-muted outline-none focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-primary',
                isActive(match) && '!text-primary',
              )}
              aria-current={isActive(match) ? 'page' : undefined}
            >
              <Icon size={22} aria-hidden="true" />
              {t(key)}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
