import { Banner, Logo, Select, cx } from '@pulse/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Link, Outlet, useNavigate } from '@tanstack/react-router';
import { Activity, Globe, LogOut, Settings } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button as RACButton } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { authClient } from '../lib/auth-client';
import { useMe } from '../lib/queries';
import { LanguageSwitch } from './LanguageSwitch';

/** Only destinations that actually exist are shown (honest UI). More arrive slice by slice. */
const NAV = [
  { to: '/today', key: 'nav.today', icon: Activity },
  { to: '/sites', key: 'nav.sites', icon: Globe },
  { to: '/settings', key: 'nav.settings', icon: Settings },
] as const;

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
      <p className="truncate px-1 text-sm font-semibold text-text">
        {me.orgs.find((o) => o.id === orgId)?.name}
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
  'flex min-h-11 items-center gap-3 rounded-md px-3 text-[0.9375rem] font-medium text-text-muted outline-none transition-colors hover:bg-surface-sunken hover:text-text focus-visible:outline-3 focus-visible:outline-primary';

export function AppShell() {
  const { t } = useTranslation();
  const { me } = useMe();
  const online = useOnline();

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-on-primary focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        {t('common.skipToContent')}
      </a>

      {/* Desktop rail */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border bg-surface px-3 py-4 lg:flex">
        <div className="px-2 pb-4">
          <Logo />
        </div>
        <div className="px-1 pb-4">
          <OrgSwitcher />
        </div>
        <nav aria-label={t('nav.main')} className="grid gap-1">
          {NAV.map(({ to, key, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={navLinkClass}
              activeProps={{
                className: 'bg-primary-soft !text-primary font-semibold',
                'aria-current': 'page',
              }}
            >
              <Icon size={20} aria-hidden="true" />
              {t(key)}
            </Link>
          ))}
        </nav>
        <div className="mt-auto grid gap-3 border-t border-border px-1 pt-4">
          <LanguageSwitch persist />
          <div className="min-w-0 px-1">
            <p className="truncate text-sm font-semibold">{me.user.name}</p>
            <p className="truncate text-xs text-text-muted">{me.user.email}</p>
          </div>
          <SignOutButton />
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
          className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-28 outline-none sm:px-6 lg:px-10 lg:pt-10 lg:pb-12"
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
          className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-border bg-surface pb-[max(env(safe-area-inset-bottom),8px)] lg:hidden"
        >
          {NAV.map(({ to, key, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={cx(
                'flex min-h-14 flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-semibold text-text-faint outline-none focus-visible:bg-primary-soft',
              )}
              activeProps={{ className: '!text-primary', 'aria-current': 'page' }}
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
