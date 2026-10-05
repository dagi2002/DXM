import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { i18n } from './i18n';
import { ApiError, onUnauthenticated } from './lib/api';
import { meQuery } from './lib/queries';
import { createAppRouter } from './router';
import './styles.css';

// Error tracking loads only when configured, so it never costs anything otherwise.
if (import.meta.env.VITE_SENTRY_DSN) {
  void import('@sentry/react').then((Sentry) =>
    Sentry.init({ dsn: import.meta.env.VITE_SENTRY_DSN, tracesSampleRate: 0.1 }),
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't hammer the API on flaky mobile networks; never retry auth/permission errors.
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
      refetchOnWindowFocus: true,
      staleTime: 15_000,
    },
  },
});

const router = createAppRouter(queryClient);

// Session expired mid-use: drop cached identity and send the user to sign in.
onUnauthenticated(() => {
  queryClient.setQueryData(meQuery.queryKey, null);
  if (!router.state.location.pathname.startsWith('/sign-in')) {
    void router.navigate({ to: '/sign-in', search: { redirect: router.state.location.href } as never });
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </I18nextProvider>
  </StrictMode>,
);
