import { Button, EmptyState, Spinner } from '@pulse/ui';
import type { QueryClient } from '@tanstack/react-query';
import {
  Outlet,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
  redirect,
  useNavigate,
} from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AppShell } from './components/AppShell';
import { authClient } from './lib/auth-client';
import { meQuery } from './lib/queries';
import { safeRedirect } from './lib/redirect';

// Every page is its own chunk: the first load only ships the shell for the route you open.
const auth = () => import('./routes/auth');
const onboarding = () => import('./routes/onboarding');
const sites = () => import('./routes/sites');
const SignInPage = lazyRouteComponent(auth, 'SignInPage');
const SignUpPage = lazyRouteComponent(auth, 'SignUpPage');
const ForgotPasswordPage = lazyRouteComponent(auth, 'ForgotPasswordPage');
const ResetPasswordPage = lazyRouteComponent(auth, 'ResetPasswordPage');
const OnboardingPage = lazyRouteComponent(onboarding, 'OnboardingPage');
const AcceptInvitationPage = lazyRouteComponent(onboarding, 'AcceptInvitationPage');
const TodayPage = lazyRouteComponent(sites, 'TodayPage');
const SitesPage = lazyRouteComponent(sites, 'SitesPage');
const SiteDetailPage = lazyRouteComponent(sites, 'SiteDetailPage');
const SettingsPage = lazyRouteComponent(() => import('./routes/settings'), 'SettingsPage');

export interface RouterContext {
  queryClient: QueryClient;
}

function PendingView() {
  const { t } = useTranslation();
  return (
    <div className="grid min-h-48 place-items-center text-primary">
      <Spinner size={28} label={t('common.loading')} />
    </div>
  );
}

function NotFound() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <main id="main" className="mx-auto max-w-lg px-4 py-24">
      <EmptyState
        title={t('errors.notFound.title')}
        body={t('errors.notFound.body')}
        action={<Button onPress={() => navigate({ to: '/' })}>{t('nav.today')}</Button>}
      />
    </main>
  );
}

function ErrorView() {
  const { t } = useTranslation();
  return (
    <main id="main" className="mx-auto max-w-lg px-4 py-24">
      <EmptyState
        title={t('errors.generic.title')}
        body={t('errors.generic.body')}
        action={<Button onPress={() => window.location.reload()}>{t('common.retry')}</Button>}
      />
    </main>
  );
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
  notFoundComponent: NotFound,
  errorComponent: ErrorView,
});

/** Signed-out only pages bounce signed-in users to the app. */
const guestOnly = async ({
  context,
  search,
}: {
  context: RouterContext;
  search: Record<string, unknown>;
}) => {
  const me = await context.queryClient.ensureQueryData(meQuery);
  if (me) throw redirect({ to: safeRedirect(search.redirect) });
};

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    throw redirect({ to: !me ? '/sign-in' : me.orgs.length === 0 ? '/onboarding' : '/today' });
  },
});

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sign-in',
  beforeLoad: guestOnly,
  component: SignInPage,
});
const signUpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sign-up',
  beforeLoad: guestOnly,
  component: SignUpPage,
});
const forgotRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/forgot-password',
  component: ForgotPasswordPage,
});
const resetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reset-password',
  component: ResetPasswordPage,
});
const acceptInvitationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/accept-invitation/$invitationId',
  component: AcceptInvitationPage,
});

const onboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/onboarding',
  beforeLoad: async ({ context, location }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (!me) throw redirect({ to: '/sign-in', search: { redirect: location.href } });
  },
  component: OnboardingPage,
});

/** Authenticated shell: requires a session and an active organization. */
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  beforeLoad: async ({ context, location }) => {
    let me = await context.queryClient.ensureQueryData(meQuery);
    if (!me) throw redirect({ to: '/sign-in', search: { redirect: location.href } });
    if (me.orgs.length === 0) throw redirect({ to: '/onboarding' });
    if (!me.activeOrgId) {
      // Fresh session (e.g. after sign-in): activate the first organization.
      await authClient.organization.setActive({ organizationId: me.orgs[0]!.id });
      me = await context.queryClient.fetchQuery(meQuery);
    }
  },
  component: AppShell,
});

const todayRoute = createRoute({ getParentRoute: () => appRoute, path: '/today', component: TodayPage });
const sitesRoute = createRoute({ getParentRoute: () => appRoute, path: '/sites', component: SitesPage });
const siteRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/sites/$siteId',
  component: SiteDetailPage,
});
const settingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/settings',
  component: SettingsPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  signInRoute,
  signUpRoute,
  forgotRoute,
  resetRoute,
  acceptInvitationRoute,
  onboardingRoute,
  appRoute.addChildren([todayRoute, sitesRoute, siteRoute, settingsRoute]),
]);

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: 'intent',
    // On slow connections a page chunk can take a moment; show progress instead of a frozen screen.
    defaultPendingMs: 300,
    defaultPendingComponent: PendingView,
    scrollRestoration: true,
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
