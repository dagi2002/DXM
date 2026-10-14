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
const TodayPage = lazyRouteComponent(() => import('./routes/today'), 'TodayPage');
const FixDetailPage = lazyRouteComponent(() => import('./routes/fixes'), 'FixDetailPage');
const replays = () => import('./routes/replays');
const ReplaysPage = lazyRouteComponent(replays, 'ReplaysPage');
const ReplayPage = lazyRouteComponent(replays, 'ReplayPage');
const reports = () => import('./routes/reports');
const ReportsPage = lazyRouteComponent(reports, 'ReportsPage');
const ReportPage = lazyRouteComponent(reports, 'ReportPage');
const PublicReportPage = lazyRouteComponent(reports, 'PublicReportPage');
const LandingPage = lazyRouteComponent(() => import('./routes/landing'), 'LandingPage');
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

/** Signed out: the public landing page. Signed in: straight into the app. */
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (me) throw redirect({ to: me.orgs.length === 0 ? '/onboarding' : '/today' });
  },
  component: LandingPage,
});

/** The landing page at a stable address, viewable while signed in too. */
const welcomeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/welcome',
  component: LandingPage,
});

/** Public, read-only client report share link. */
const publicReportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/r/$token',
  component: PublicReportPage,
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
      // Bypass staleTime: `me` was usually fetched moments ago (right after sign-in), and a
      // cached copy without an active org would crash the shell.
      me = await context.queryClient.fetchQuery({ ...meQuery, staleTime: 0 });
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
const fixRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/fixes/$fixId',
  component: FixDetailPage,
});
const replaysRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/replays',
  component: ReplaysPage,
});
const replayRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/replays/$replayId',
  component: ReplayPage,
});
const reportsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/reports',
  component: ReportsPage,
});
const reportRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/reports/$reportId',
  component: ReportPage,
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
  publicReportRoute,
  welcomeRoute,
  onboardingRoute,
  appRoute.addChildren([
    todayRoute,
    fixRoute,
    sitesRoute,
    siteRoute,
    replaysRoute,
    replayRoute,
    reportsRoute,
    reportRoute,
    settingsRoute,
  ]),
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
