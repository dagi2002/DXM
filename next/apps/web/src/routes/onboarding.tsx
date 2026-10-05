import { Banner, Button, Card, Spinner, TextField } from '@pulse/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { AuthLayout, TextLink } from '../components/AuthLayout';
import { authClient } from '../lib/auth-client';
import { meQuery, refreshMe } from '../lib/queries';

/** URL-safe slug; falls back for names written only in Ge'ez script. */
export function slugify(name: string): string {
  const base = name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base || 'org'}-${suffix}`;
}

export function OnboardingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setPending(true);
    setError(null);
    const { error: err } = await authClient.organization.create({ name: name.trim(), slug: slugify(name) });
    if (err) {
      setPending(false);
      return setError(t('auth.error.generic'));
    }
    await refreshMe(qc);
    await navigate({ to: '/today' });
  };

  return (
    <AuthLayout title={t('onboarding.title')} subtitle={t('onboarding.subtitle')}>
      <form onSubmit={submit} className="grid gap-4" noValidate>
        {error ? <Banner tone="bad" title={error} /> : null}
        <TextField
          label={t('onboarding.orgName')}
          placeholder={t('onboarding.orgName.placeholder')}
          value={name}
          onChange={setName}
          isRequired
          autoFocus
          autoComplete="organization"
        />
        <Button
          type="submit"
          className="w-full"
          isPending={pending}
          pendingLabel={t('common.saving')}
          isDisabled={!name.trim()}
        >
          {t('onboarding.submit')}
        </Button>
      </form>
    </AuthLayout>
  );
}

export function AcceptInvitationPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { invitationId } = useParams({ strict: false }) as { invitationId: string };
  const me = useQuery(meQuery);
  const invitation = useQuery({
    queryKey: ['invitation', invitationId],
    enabled: !!me.data,
    retry: false,
    queryFn: async () => {
      const { data, error } = await authClient.organization.getInvitation({ query: { id: invitationId } });
      if (error || !data) throw new Error(error?.code ?? 'invalid');
      return data;
    },
  });
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const redirect = `/accept-invitation/${invitationId}`;

  const accept = async () => {
    setPending(true);
    const { error } = await authClient.organization.acceptInvitation({ invitationId });
    if (error) {
      setPending(false);
      return setFailed(true);
    }
    await refreshMe(qc);
    await navigate({ to: '/today' });
  };

  if (me.isLoading || invitation.isLoading) {
    return (
      <AuthLayout title={t('common.loading')}>
        <Spinner label={t('common.loading')} />
      </AuthLayout>
    );
  }

  if (!me.data) {
    return (
      <AuthLayout title={t('settings.team.invite')} subtitle={t('invite.signInToAccept')}>
        <div className="grid gap-3">
          <TextLink to="/sign-in" search={{ redirect }}>
            {t('auth.signIn.submit')}
          </TextLink>
          <TextLink to="/sign-up" search={{ redirect }}>
            {t('auth.signIn.createAccount')}
          </TextLink>
        </div>
      </AuthLayout>
    );
  }

  if (invitation.isError || failed || !invitation.data) {
    return (
      <AuthLayout title={t('errors.generic.title')}>
        <Banner tone="bad" title={t('invite.invalid')} />
      </AuthLayout>
    );
  }

  const inv = invitation.data as { organizationName?: string; inviterEmail?: string; role?: string };
  return (
    <AuthLayout title={t('invite.title', { org: inv.organizationName ?? '' })}>
      <Card>
        <p className="text-text-muted">
          {t('invite.subtitle', {
            inviter: inv.inviterEmail ?? '',
            role: t(`settings.team.role.${inv.role ?? 'member'}`),
          })}
        </p>
        <Button
          className="mt-5 w-full"
          onPress={accept}
          isPending={pending}
          pendingLabel={t('common.loading')}
        >
          {t('invite.accept')}
        </Button>
      </Card>
    </AuthLayout>
  );
}
