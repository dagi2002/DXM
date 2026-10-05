import { canManage, type Role } from '@pulse/contracts/constants';
import type { Me } from '@pulse/contracts';
import type { CalendarPref, Locale } from '@pulse/i18n';
import {
  Banner,
  Button,
  Card,
  PageHeader,
  Segmented,
  Select,
  Skeleton,
  StatusBadge,
  TextField,
} from '@pulse/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { Tab, TabList, TabPanel, Tabs } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { authClient } from '../lib/auth-client';
import { meQuery, refreshMe, useFormatDate, useMe } from '../lib/queries';

const TABS = ['profile', 'organization', 'team'] as const;
type TabId = (typeof TABS)[number];

type Theme = 'system' | 'light' | 'dark';
function applyTheme(theme: Theme) {
  try {
    if (theme === 'system') {
      document.documentElement.removeAttribute('data-theme');
      localStorage.removeItem('pulse.theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('pulse.theme', theme);
    }
  } catch {
    /* storage unavailable */
  }
}
const currentTheme = (): Theme =>
  (document.documentElement.getAttribute('data-theme') as Theme | null) ?? 'system';

function ProfileSection() {
  const { t, i18n } = useTranslation();
  const { me } = useMe();
  const qc = useQueryClient();
  const [name, setName] = useState(me.user.name);
  const [locale, setLocale] = useState<Locale>(me.user.locale);
  const [calendar, setCalendar] = useState<CalendarPref>(me.user.calendar);
  const [theme, setTheme] = useState<Theme>(currentTheme);
  const save = useMutation({
    mutationFn: () => api<Me>('/me/preferences', { method: 'PATCH', body: { name, locale, calendar } }),
    onSuccess: async (updated) => {
      qc.setQueryData(meQuery.queryKey, updated);
      await i18n.changeLanguage(locale);
      applyTheme(theme);
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  return (
    <Card as="section">
      <h2 className="font-display text-lg font-bold">{t('settings.profile')}</h2>
      <p className="mt-1 text-sm text-text-muted">{t('settings.profile.subtitle')}</p>
      <form onSubmit={submit} className="mt-5 grid max-w-md gap-5">
        {save.isSuccess ? <Banner tone="good" title={t('common.saved')} /> : null}
        {save.isError ? <Banner tone="bad" title={t('errors.generic.body')} /> : null}
        <TextField label={t('auth.name')} value={name} onChange={setName} autoComplete="name" isRequired />
        <Segmented
          label={t('common.language')}
          value={locale}
          onChange={(v) => setLocale(v as Locale)}
          options={[
            { id: 'en', label: 'English', lang: 'en' },
            { id: 'am', label: 'አማርኛ', lang: 'am' },
          ]}
        />
        <Segmented
          label={t('common.calendar')}
          value={calendar}
          onChange={(v) => setCalendar(v as CalendarPref)}
          options={[
            { id: 'gregorian', label: t('common.calendar.gregorian') },
            { id: 'ethiopian', label: t('common.calendar.ethiopian') },
          ]}
        />
        <Segmented
          label={t('common.theme')}
          value={theme}
          onChange={(v) => setTheme(v as Theme)}
          options={[
            { id: 'system', label: t('common.theme.system') },
            { id: 'light', label: t('common.theme.light') },
            { id: 'dark', label: t('common.theme.dark') },
          ]}
        />
        <div>
          <Button type="submit" isPending={save.isPending} pendingLabel={t('common.saving')}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function OrganizationSection() {
  const { t } = useTranslation();
  const { activeOrg, role } = useMe();
  const qc = useQueryClient();
  const [name, setName] = useState(activeOrg.name);
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.organization.update({
        data: { name: name.trim() },
        organizationId: activeOrg.id,
      });
      if (error) throw new Error(error.code ?? 'failed');
    },
    onSuccess: () => refreshMe(qc),
  });
  const manage = canManage(role);
  return (
    <Card as="section">
      <h2 className="font-display text-lg font-bold">{t('settings.organization')}</h2>
      <form
        className="mt-5 grid max-w-md gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        {save.isSuccess ? <Banner tone="good" title={t('common.saved')} /> : null}
        {save.isError ? <Banner tone="bad" title={t('errors.generic.body')} /> : null}
        <TextField
          label={t('settings.organization.name')}
          value={name}
          onChange={setName}
          isDisabled={!manage}
          isRequired
        />
        {manage ? (
          <div>
            <Button
              type="submit"
              isPending={save.isPending}
              pendingLabel={t('common.saving')}
              isDisabled={!name.trim() || name.trim() === activeOrg.name}
            >
              {t('common.save')}
            </Button>
          </div>
        ) : null}
      </form>
    </Card>
  );
}

interface FullOrg {
  members: { id: string; role: string; userId: string; user: { name: string; email: string } }[];
  invitations: { id: string; email: string; role: string | null; status: string; expiresAt: string | Date }[];
}

function TeamSection() {
  const { t } = useTranslation();
  const { me, orgId, role } = useMe();
  const formatDate = useFormatDate();
  const qc = useQueryClient();
  const manage = canManage(role);
  const team = useQuery({
    queryKey: ['orgs', orgId, 'team'],
    queryFn: async () => {
      const { data, error } = await authClient.organization.getFullOrganization({
        query: { organizationId: orgId },
      });
      if (error || !data) throw new Error(error?.code ?? 'failed');
      return data as unknown as FullOrg;
    },
  });
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Exclude<Role, 'owner'>>('member');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const invite = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.organization.inviteMember({
        email: email.trim(),
        role: inviteRole as 'member',
        organizationId: orgId,
      });
      if (error) throw new Error(error.code ?? 'failed');
    },
    onSuccess: async () => {
      setSentTo(email.trim());
      setEmail('');
      await qc.invalidateQueries({ queryKey: ['orgs', orgId, 'team'] });
    },
  });
  const revoke = useMutation({
    mutationFn: (invitationId: string) => authClient.organization.cancelInvitation({ invitationId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orgs', orgId, 'team'] }),
  });
  const removeMember = useMutation({
    mutationFn: (memberIdOrEmail: string) =>
      authClient.organization.removeMember({ memberIdOrEmail, organizationId: orgId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orgs', orgId, 'team'] }),
  });

  const roleOptions = (['admin', 'member', 'client_viewer'] as const).map((r) => ({
    id: r,
    label: t(`settings.team.role.${r}`),
  }));
  const pending = team.data?.invitations.filter((i) => i.status === 'pending') ?? [];

  return (
    <Card as="section">
      <h2 className="font-display text-lg font-bold">{t('settings.team')}</h2>
      <p className="mt-1 text-sm text-text-muted">{t('settings.team.subtitle')}</p>

      {manage ? (
        <form
          className="mt-5 grid gap-4 rounded-md bg-surface-sunken p-4 sm:grid-cols-[1fr_200px_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            setSentTo(null);
            invite.mutate();
          }}
        >
          <TextField
            label={t('settings.team.inviteEmail')}
            type="email"
            autoComplete="off"
            value={email}
            onChange={setEmail}
            isRequired
            lang="en"
          />
          <Select
            label={t('settings.team.role')}
            selectedKey={inviteRole}
            onSelectionChange={(k) => setInviteRole(k as typeof inviteRole)}
            options={roleOptions}
          />
          <Button
            type="submit"
            isPending={invite.isPending}
            pendingLabel={t('common.saving')}
            isDisabled={!email.includes('@')}
          >
            {t('settings.team.invite')}
          </Button>
          <p className="text-xs text-text-muted sm:col-span-3">{t('settings.team.role.help')}</p>
        </form>
      ) : null}
      {sentTo ? (
        <div className="mt-4">
          <Banner tone="good" title={t('settings.team.invited', { email: sentTo })} />
        </div>
      ) : null}
      {invite.isError ? (
        <div className="mt-4">
          <Banner tone="bad" title={t('errors.generic.body')} />
        </div>
      ) : null}

      {team.isLoading ? (
        <Skeleton className="mt-5 h-24" />
      ) : (
        <ul className="mt-5 divide-y divide-border" aria-label={t('settings.team')}>
          {team.data?.members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 py-3">
              <span
                className="grid size-9 place-items-center rounded-full bg-primary-soft text-sm font-bold text-primary"
                aria-hidden="true"
              >
                {m.user.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">
                  {m.user.name}
                  {m.userId === me.user.id ? (
                    <span className="font-normal text-text-muted"> ({t('settings.team.you')})</span>
                  ) : null}
                </span>
                <span className="block truncate text-sm text-text-muted" lang="en">
                  {m.user.email}
                </span>
              </span>
              <StatusBadge tone="info">{t(`settings.team.role.${m.role}`)}</StatusBadge>
              {manage && m.role !== 'owner' && m.userId !== me.user.id ? (
                <Button variant="ghost" size="sm" onPress={() => removeMember.mutate(m.id)}>
                  {t('settings.team.remove')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {pending.length ? (
        <>
          <h3 className="mt-6 text-sm font-semibold text-text-muted">{t('settings.team.pending')}</h3>
          <ul className="mt-2 divide-y divide-border">
            {pending.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="min-w-0 flex-1 truncate" lang="en">
                  {inv.email}
                </span>
                <span className="text-sm text-text-muted">
                  {t(`settings.team.role.${inv.role ?? 'member'}`)}
                </span>
                <span className="text-xs text-text-faint">{formatDate(inv.expiresAt)}</span>
                {manage ? (
                  <Button variant="ghost" size="sm" onPress={() => revoke.mutate(inv.id)}>
                    {t('settings.team.revoke')}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Card>
  );
}

export function SettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { tab?: string };
  const tab: TabId = TABS.includes(search.tab as TabId) ? (search.tab as TabId) : 'profile';
  const tabClass =
    'inline-flex min-h-11 cursor-default items-center rounded-md px-3 text-sm font-semibold text-text-muted outline-none data-[hovered]:text-text data-[selected]:bg-surface data-[selected]:text-text data-[selected]:shadow-sm data-[focus-visible]:outline-3 data-[focus-visible]:outline-primary';
  return (
    <>
      <PageHeader title={t('settings.title')} />
      <Tabs
        selectedKey={tab}
        onSelectionChange={(k) => navigate({ to: '/settings', search: { tab: String(k) }, replace: true })}
      >
        <TabList
          aria-label={t('settings.title')}
          className="mb-5 inline-flex flex-wrap gap-1 rounded-md border border-border bg-surface-sunken p-1"
        >
          {TABS.map((id) => (
            <Tab key={id} id={id} className={tabClass}>
              {t(`settings.${id}`)}
            </Tab>
          ))}
        </TabList>
        <TabPanel id="profile" className="outline-none">
          <ProfileSection />
        </TabPanel>
        <TabPanel id="organization" className="outline-none">
          <OrganizationSection />
        </TabPanel>
        <TabPanel id="team" className="outline-none">
          <TeamSection />
        </TabPanel>
      </Tabs>
    </>
  );
}
