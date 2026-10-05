import { defaultCalendar, type Locale } from '@pulse/i18n';
import { Banner, Button, TextField } from '@pulse/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { AuthLayout, TextLink } from '../components/AuthLayout';
import { PasswordField } from '../components/PasswordField';
import { authClient, authErrorKey } from '../lib/auth-client';
import { safeRedirect } from '../lib/redirect';
import { publicConfigQuery, refreshMe } from '../lib/queries';

function Divider() {
  const { t } = useTranslation();
  return (
    <div className="my-5 flex items-center gap-3 text-xs text-text-faint" aria-hidden="true">
      <span className="h-px flex-1 bg-border" />
      {t('auth.or')}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

function GoogleButton({ withDivider = false }: { withDivider?: boolean }) {
  const { t } = useTranslation();
  const { data } = useQuery(publicConfigQuery);
  if (!data?.googleEnabled) return null;
  return (
    <>
      {withDivider ? <Divider /> : null}
      <Button
        variant="secondary"
        className="w-full"
        onPress={() =>
          authClient.signIn.social({ provider: 'google', callbackURL: `${window.location.origin}/` })
        }
      >
        {t('auth.google')}
      </Button>
    </>
  );
}

export function SignInPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const search = useSearch({ strict: false }) as { redirect?: string };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<'password' | 'magic' | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setPending('password');
    const { error: err } = await authClient.signIn.email({ email, password });
    setPending(null);
    if (err) return setError(t(authErrorKey(err.code)));
    await refreshMe(qc);
    await navigate({ to: safeRedirect(search.redirect) });
  };

  const sendMagicLink = async () => {
    setError(null);
    if (!email) return setError(t('auth.error.generic'));
    setPending('magic');
    const { error: err } = await authClient.signIn.magicLink({
      email,
      callbackURL: `${window.location.origin}${safeRedirect(search.redirect)}`,
    });
    setPending(null);
    if (err) return setError(t(authErrorKey(err.code)));
    setNotice(t('auth.magicLink.sent', { email }));
  };

  return (
    <AuthLayout
      title={t('auth.signIn.title')}
      footer={
        <>
          {t('auth.signIn.noAccount')}{' '}
          <TextLink to="/sign-up" search={search.redirect ? { redirect: search.redirect } : undefined}>
            {t('auth.signIn.createAccount')}
          </TextLink>
        </>
      }
    >
      <form onSubmit={submit} className="grid gap-4" noValidate>
        {error ? <Banner tone="bad" title={error} /> : null}
        {notice ? <Banner tone="good" title={notice} /> : null}
        <TextField
          label={t('auth.email')}
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={setEmail}
          isRequired
          autoFocus
        />
        <PasswordField value={password} onChange={setPassword} autoComplete="current-password" />
        <div className="-mt-1 text-right text-sm">
          <TextLink to="/forgot-password">{t('auth.forgot')}</TextLink>
        </div>
        <Button
          type="submit"
          className="w-full"
          isPending={pending === 'password'}
          pendingLabel={t('common.loading')}
        >
          {t('auth.signIn.submit')}
        </Button>
      </form>
      <Divider />
      <div className="grid gap-3">
        <Button
          variant="secondary"
          className="w-full"
          onPress={sendMagicLink}
          isPending={pending === 'magic'}
          pendingLabel={t('common.loading')}
        >
          {t('auth.magicLink.button')}
        </Button>
        <GoogleButton />
      </div>
    </AuthLayout>
  );
}

export function SignUpPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const search = useSearch({ strict: false }) as { redirect?: string };
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 10) return setError(t('auth.error.weakPassword'));
    setPending(true);
    const locale = i18n.language as Locale;
    const { error: err } = await authClient.signUp.email({
      name,
      email,
      password,
      locale,
      calendar: defaultCalendar(locale),
      callbackURL: `${window.location.origin}/`,
    } as Parameters<typeof authClient.signUp.email>[0]);
    setPending(false);
    if (err) return setError(t(authErrorKey(err.code)));
    await refreshMe(qc);
    await navigate({ to: search.redirect ? safeRedirect(search.redirect) : '/onboarding' });
  };

  return (
    <AuthLayout
      title={t('auth.signUp.title')}
      subtitle={t('auth.signUp.subtitle')}
      footer={
        <>
          {t('auth.signUp.haveAccount')}{' '}
          <TextLink to="/sign-in" search={search.redirect ? { redirect: search.redirect } : undefined}>
            {t('auth.signIn.submit')}
          </TextLink>
        </>
      }
    >
      <form onSubmit={submit} className="grid gap-4" noValidate>
        {error ? <Banner tone="bad" title={error} /> : null}
        <TextField
          label={t('auth.name')}
          name="name"
          autoComplete="name"
          value={name}
          onChange={setName}
          isRequired
          autoFocus
        />
        <TextField
          label={t('auth.email')}
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={setEmail}
          isRequired
        />
        <PasswordField
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          description={t('auth.password.hint')}
        />
        <Button type="submit" className="w-full" isPending={pending} pendingLabel={t('common.loading')}>
          {t('auth.signUp.submit')}
        </Button>
      </form>
      <GoogleButton withDivider />
    </AuthLayout>
  );
}

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true);
    await authClient.requestPasswordReset({ email, redirectTo: `${window.location.origin}/reset-password` });
    setPending(false);
    setSent(true); // Same message whether or not the account exists.
  };
  return (
    <AuthLayout
      title={t('auth.forgot.title')}
      subtitle={t('auth.forgot.subtitle')}
      footer={<TextLink to="/sign-in">{t('auth.backToSignIn')}</TextLink>}
    >
      {sent ? (
        <Banner tone="good" title={t('auth.forgot.sent', { email })} />
      ) : (
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <TextField
            label={t('auth.email')}
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={setEmail}
            isRequired
            autoFocus
          />
          <Button type="submit" className="w-full" isPending={pending} pendingLabel={t('common.loading')}>
            {t('auth.forgot.submit')}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const search = useSearch({ strict: false }) as { token?: string; error?: string };
  const [password, setPassword] = useState('');
  const [state, setState] = useState<'idle' | 'pending' | 'done' | 'invalid'>(
    search.error || !search.token ? 'invalid' : 'idle',
  );
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 10) return;
    setState('pending');
    const { error } = await authClient.resetPassword({ newPassword: password, token: search.token! });
    setState(error ? 'invalid' : 'done');
  };
  return (
    <AuthLayout
      title={t('auth.reset.title')}
      footer={<TextLink to="/sign-in">{t('auth.backToSignIn')}</TextLink>}
    >
      {state === 'done' ? <Banner tone="good" title={t('auth.reset.done')} /> : null}
      {state === 'invalid' ? <Banner tone="bad" title={t('auth.reset.invalid')} /> : null}
      {state === 'idle' || state === 'pending' ? (
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <PasswordField
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            description={t('auth.password.hint')}
            errorMessage={password && password.length < 10 ? t('auth.error.weakPassword') : undefined}
          />
          <Button
            type="submit"
            className="w-full"
            isPending={state === 'pending'}
            pendingLabel={t('common.saving')}
          >
            {t('auth.reset.submit')}
          </Button>
        </form>
      ) : null}
    </AuthLayout>
  );
}
