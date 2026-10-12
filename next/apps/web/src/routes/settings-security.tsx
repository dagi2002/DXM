import type { ActiveSession, ActiveSessions } from '@pulse/contracts';
import { formatRelative, type Locale } from '@pulse/i18n';
import { Banner, Button, Card, CopyField, Modal, Skeleton, StatusBadge, TextField } from '@pulse/ui';
import { Checkbox } from '@pulse/ui/checkbox';
import { QrCode } from '@pulse/ui/qr-code';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Download, Monitor, Smartphone, Tablet } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { PasswordField } from '../components/PasswordField';
import { api } from '../lib/api';
import { authClient, authErrorKey } from '../lib/auth-client';
import { groupKey, parseUserAgent, secretFromOtpauth } from '../lib/device';
import { refreshMe, useFormatDate, useMe } from '../lib/queries';
import { twoFactor } from '../lib/two-factor';

/** Throws with the Better Auth error code so screens can map it to a message. */
async function unwrap<T>(p: Promise<{ data: T | null; error: { code?: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.code ?? 'failed');
  return data as T;
}

function useHasPassword() {
  return useQuery({
    queryKey: ['me', 'accounts'],
    queryFn: async () => {
      const accounts = await unwrap(authClient.listAccounts());
      return (accounts as { providerId: string }[]).some((a) => a.providerId === 'credential');
    },
    staleTime: 5 * 60_000,
  });
}

/* ── Backup codes ───────────────────────────────────────────────────────── */
function BackupCodes({ codes }: { codes: string[] }) {
  const { t } = useTranslation();
  const text = codes.join('\n');
  const download = () => {
    const blob = new Blob([`${t('settings.security.backup.fileHeader')}\n\n${text}\n`], {
      type: 'text/plain;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dxm-pulse-backup-codes.txt';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  return (
    <div className="grid gap-3">
      <CopyField
        value={text}
        label={t('settings.security.backup.codesLabel')}
        copyLabel={t('install.copy')}
        copiedLabel={t('install.copied')}
      />
      <div>
        <Button variant="secondary" size="sm" onPress={download}>
          <Download size={16} aria-hidden="true" />
          {t('settings.security.backup.download')}
        </Button>
      </div>
    </div>
  );
}

/* ── Password confirmation step (shared) ────────────────────────────────── */
function ConfirmPassword({
  intro,
  submitLabel,
  danger = false,
  onConfirm,
}: {
  intro: string;
  submitLabel: string;
  danger?: boolean;
  onConfirm: (password: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await onConfirm(password);
    } catch (err) {
      setError(t(authErrorKey((err as Error).message)));
      setPending(false);
    }
  };
  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <p className="text-sm text-text-muted">{intro}</p>
      {error ? <Banner tone="bad" title={error} /> : null}
      <PasswordField
        label={t('settings.security.currentPassword')}
        value={password}
        onChange={setPassword}
        autoComplete="current-password"
      />
      <div>
        <Button
          type="submit"
          variant={danger ? 'danger' : 'primary'}
          isPending={pending}
          pendingLabel={t('common.loading')}
          isDisabled={!password}
        >
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

/* ── Enable flow ────────────────────────────────────────────────────────── */
type Setup = { totpURI: string; backupCodes: string[] };

function EnableTwoFactor({ onFinished }: { onFinished: () => void }) {
  const { t } = useTranslation();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [step, setStep] = useState<'password' | 'scan' | 'codes'>('password');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);

  if (step === 'password') {
    return (
      <ConfirmPassword
        intro={t('settings.security.2fa.setup.passwordIntro')}
        submitLabel={t('common.continue')}
        onConfirm={async (password) => {
          const data = await unwrap(twoFactor.enable(password));
          setSetup(data);
          setStep('scan');
        }}
      />
    );
  }

  if (step === 'scan' && setup) {
    const secret = secretFromOtpauth(setup.totpURI);
    const verify = async (e: FormEvent) => {
      e.preventDefault();
      setError(null);
      const value = code.replace(/\s+/g, '');
      if (!/^\d{6}$/.test(value)) return setError(t('auth.twoFactor.error.format'));
      setPending(true);
      const { error: err } = await twoFactor.verifyTotp(value);
      setPending(false);
      if (err) return setError(t('auth.twoFactor.error.invalidCode'));
      setStep('codes');
    };
    return (
      <form onSubmit={verify} className="grid gap-5" noValidate>
        <ol className="grid list-decimal gap-1 pl-5 text-sm text-text-muted">
          <li>{t('settings.security.2fa.setup.step1')}</li>
          <li>{t('settings.security.2fa.setup.step2')}</li>
          <li>{t('settings.security.2fa.setup.step3')}</li>
        </ol>
        <div className="grid justify-items-center gap-3 sm:grid-cols-[auto_1fr] sm:items-center sm:justify-items-start">
          <QrCode value={setup.totpURI} className="border border-border p-1" />
          <div className="grid w-full gap-1.5">
            <p className="text-sm font-semibold">{t('settings.security.2fa.setup.manualKey')}</p>
            <p className="text-[0.8125rem] text-text-muted">{t('settings.security.2fa.setup.manualHelp')}</p>
            <CopyField
              value={groupKey(secret)}
              label={t('settings.security.2fa.setup.manualKey')}
              copyLabel={t('install.copy')}
              copiedLabel={t('install.copied')}
            />
          </div>
        </div>
        {error ? <Banner tone="bad" title={error} /> : null}
        <TextField
          label={t('auth.twoFactor.code')}
          name="code"
          autoComplete="one-time-code"
          inputMode="numeric"
          maxLength={7}
          value={code}
          onChange={setCode}
          isRequired
          lang="en"
        />
        <div>
          <Button type="submit" isPending={pending} pendingLabel={t('common.loading')}>
            {t('settings.security.2fa.setup.verify')}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="grid gap-4">
      <Banner tone="good" title={t('settings.security.2fa.setup.done')} />
      <p className="text-sm text-text-muted">{t('settings.security.backup.intro')}</p>
      <BackupCodes codes={setup?.backupCodes ?? []} />
      <Checkbox isSelected={saved} onChange={setSaved}>
        {t('settings.security.backup.confirmSaved')}
      </Checkbox>
      <div>
        <Button isDisabled={!saved} onPress={onFinished}>
          {t('settings.security.2fa.setup.finish')}
        </Button>
      </div>
    </div>
  );
}

function RegenerateBackupCodes({ onFinished }: { onFinished: () => void }) {
  const { t } = useTranslation();
  const [codes, setCodes] = useState<string[] | null>(null);
  if (!codes) {
    return (
      <ConfirmPassword
        intro={t('settings.security.backup.regenerateIntro')}
        submitLabel={t('settings.security.backup.regenerate')}
        onConfirm={async (password) => {
          const data = await unwrap(twoFactor.generateBackupCodes(password));
          setCodes(data.backupCodes);
        }}
      />
    );
  }
  return (
    <div className="grid gap-4">
      <p className="text-sm text-text-muted">{t('settings.security.backup.intro')}</p>
      <BackupCodes codes={codes} />
      <div>
        <Button onPress={onFinished}>{t('common.close')}</Button>
      </div>
    </div>
  );
}

/* ── Two-step verification card ─────────────────────────────────────────── */
function TwoFactorCard() {
  const { t } = useTranslation();
  const { me } = useMe();
  const qc = useQueryClient();
  const hasPassword = useHasPassword();
  const [dialog, setDialog] = useState<'enable' | 'disable' | 'codes' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const enabled = me.user.twoFactorEnabled;

  const close = async (message?: string) => {
    setDialog(null);
    if (message) setNotice(message);
    await refreshMe(qc);
  };

  const titles = {
    enable: t('settings.security.2fa.setup.title'),
    disable: t('settings.security.2fa.disable.title'),
    codes: t('settings.security.backup.title'),
  } as const;

  return (
    <Card as="section">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-xl">
          <h2 className="font-display text-lg font-bold">{t('settings.security.2fa.title')}</h2>
          <p className="mt-1 text-sm text-text-muted">{t('settings.security.2fa.subtitle')}</p>
        </div>
        <StatusBadge tone={enabled ? 'good' : 'info'}>
          {t(enabled ? 'settings.security.2fa.on' : 'settings.security.2fa.off')}
        </StatusBadge>
      </div>

      <div className="mt-5 grid gap-4">
        {notice ? (
          <Banner
            tone="good"
            title={notice}
            onDismiss={() => setNotice(null)}
            dismissLabel={t('common.close')}
          />
        ) : null}
        {hasPassword.data === false && !enabled ? (
          <Banner tone="info" title={t('settings.security.2fa.needsPassword.title')}>
            {t('settings.security.2fa.needsPassword.body')}{' '}
            <Link to="/forgot-password" className="font-semibold text-primary underline underline-offset-4">
              {t('settings.security.2fa.needsPassword.link')}
            </Link>
          </Banner>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {enabled ? (
            <>
              <Button variant="secondary" onPress={() => setDialog('codes')}>
                {t('settings.security.backup.regenerate')}
              </Button>
              <Button variant="danger-ghost" onPress={() => setDialog('disable')}>
                {t('settings.security.2fa.disable')}
              </Button>
            </>
          ) : (
            <Button onPress={() => setDialog('enable')} isDisabled={hasPassword.data === false}>
              {t('settings.security.2fa.enable')}
            </Button>
          )}
        </div>
      </div>

      <Modal
        isOpen={dialog !== null}
        onOpenChange={(open) => {
          if (!open) void close();
        }}
        title={dialog ? titles[dialog] : ''}
        closeLabel={t('common.close')}
      >
        {dialog === 'enable' ? (
          <EnableTwoFactor onFinished={() => void close(t('settings.security.2fa.enabledNotice'))} />
        ) : null}
        {dialog === 'disable' ? (
          <ConfirmPassword
            intro={t('settings.security.2fa.disable.intro')}
            submitLabel={t('settings.security.2fa.disable')}
            danger
            onConfirm={async (password) => {
              await unwrap(twoFactor.disable(password));
              await close(t('settings.security.2fa.disabledNotice'));
            }}
          />
        ) : null}
        {dialog === 'codes' ? <RegenerateBackupCodes onFinished={() => void close()} /> : null}
      </Modal>
    </Card>
  );
}

/* ── Active sessions card ───────────────────────────────────────────────── */
const sessionsKey = ['me', 'sessions'] as const;

function DeviceIcon({ kind }: { kind: 'mobile' | 'tablet' | 'desktop' }) {
  const Icon = kind === 'mobile' ? Smartphone : kind === 'tablet' ? Tablet : Monitor;
  return (
    <span
      className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-primary"
      aria-hidden="true"
    >
      <Icon size={18} />
    </span>
  );
}

function SessionRow({
  session,
  onRevoke,
  revoking,
}: {
  session: ActiveSession;
  onRevoke: (id: string) => void;
  revoking: boolean;
}) {
  const { t, i18n } = useTranslation();
  const formatDate = useFormatDate();
  const device = parseUserAgent(session.userAgent);
  const name =
    device.browser && device.os
      ? t('settings.security.sessions.deviceName', { browser: device.browser, os: device.os })
      : (device.browser ?? device.os ?? t('settings.security.sessions.unknownDevice'));
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <DeviceIcon kind={device.kind} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2 font-semibold">
          <span lang={device.browser || device.os ? 'en' : undefined}>{name}</span>
          {session.current ? (
            <StatusBadge tone="good">{t('settings.security.sessions.current')}</StatusBadge>
          ) : null}
        </span>
        <span className="block text-sm text-text-muted">
          {session.current
            ? t('settings.security.sessions.activeNow')
            : t('settings.security.sessions.lastActive', {
                when: formatRelative(session.lastActiveAt, i18n.language as Locale),
              })}
          {session.ipAddress ? (
            <>
              {' · '}
              <span lang="en" dir="ltr">
                {session.ipAddress}
              </span>
            </>
          ) : null}
        </span>
        <span className="block text-xs text-text-faint">
          {t('settings.security.sessions.signedIn', { date: formatDate(session.createdAt) })}
        </span>
      </span>
      {session.current ? null : (
        <Button
          variant="ghost"
          size="sm"
          onPress={() => onRevoke(session.id)}
          isPending={revoking}
          pendingLabel={t('common.loading')}
          aria-label={t('settings.security.sessions.revokeNamed', { device: name })}
        >
          {t('settings.security.sessions.revoke')}
        </Button>
      )}
    </li>
  );
}

function SessionsCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [confirmAll, setConfirmAll] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const sessions = useQuery({
    queryKey: sessionsKey,
    queryFn: ({ signal }) => api<ActiveSessions>('/me/sessions', { signal }).then((r) => r.sessions),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api<{ revoked: number }>(`/me/sessions/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      setNotice(t('settings.security.sessions.revoked'));
      return qc.invalidateQueries({ queryKey: sessionsKey });
    },
  });
  const revokeOthers = useMutation({
    mutationFn: () => api<{ revoked: number }>('/me/sessions/revoke-others', { method: 'POST', body: {} }),
    onSuccess: (r) => {
      setConfirmAll(false);
      setNotice(t('settings.security.sessions.revokedOthers', { count: r.revoked }));
      return qc.invalidateQueries({ queryKey: sessionsKey });
    },
  });
  const others = sessions.data?.filter((s) => !s.current).length ?? 0;

  return (
    <Card as="section">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-xl">
          <h2 className="font-display text-lg font-bold">{t('settings.security.sessions.title')}</h2>
          <p className="mt-1 text-sm text-text-muted">{t('settings.security.sessions.subtitle')}</p>
        </div>
        {others > 0 ? (
          <Button variant="secondary" onPress={() => setConfirmAll(true)}>
            {t('settings.security.sessions.revokeOthers')}
          </Button>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3">
        {notice ? (
          <Banner
            tone="good"
            title={notice}
            onDismiss={() => setNotice(null)}
            dismissLabel={t('common.close')}
          />
        ) : null}
        {revoke.isError || revokeOthers.isError ? (
          <Banner tone="bad" title={t('errors.generic.body')} />
        ) : null}
        {sessions.isError ? <Banner tone="bad" title={t('errors.generic.body')} /> : null}
      </div>

      {sessions.isLoading ? (
        <Skeleton className="mt-4 h-24" />
      ) : (
        <ul className="mt-2 divide-y divide-border" aria-label={t('settings.security.sessions.title')}>
          {sessions.data?.map((s) => (
            <SessionRow
              key={s.id}
              session={s}
              onRevoke={(id) => revoke.mutate(id)}
              revoking={revoke.isPending && revoke.variables === s.id}
            />
          ))}
        </ul>
      )}
      {sessions.data && others === 0 ? (
        <p className="mt-2 text-sm text-text-muted">{t('settings.security.sessions.onlyThis')}</p>
      ) : null}

      <Modal
        isOpen={confirmAll}
        onOpenChange={setConfirmAll}
        title={t('settings.security.sessions.revokeOthers.title')}
        closeLabel={t('common.close')}
      >
        <p className="text-sm text-text-muted">
          {t('settings.security.sessions.revokeOthers.body', { count: others })}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            variant="danger"
            onPress={() => revokeOthers.mutate()}
            isPending={revokeOthers.isPending}
            pendingLabel={t('common.loading')}
          >
            {t('settings.security.sessions.revokeOthers')}
          </Button>
          <Button variant="ghost" onPress={() => setConfirmAll(false)}>
            {t('common.cancel')}
          </Button>
        </div>
      </Modal>
    </Card>
  );
}

export function SecuritySection() {
  return (
    <div className="grid gap-5">
      <TwoFactorCard />
      <SessionsCard />
    </div>
  );
}
