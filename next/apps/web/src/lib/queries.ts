import type {
  InsightsRange,
  Me,
  Site,
  SiteFunnel,
  SiteInsights,
  SiteInstall,
  Today,
  WeekSummary,
} from '@pulse/contracts';
import { formatDate, type CalendarPref, type Locale } from '@pulse/i18n';
import { queryOptions, useQuery, type QueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from './api';

export const meQuery = queryOptions({
  queryKey: ['me'],
  queryFn: async (): Promise<Me | null> => {
    try {
      return await api<Me>('/me', { quietUnauthenticated: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return null;
      throw err;
    }
  },
  staleTime: 60_000,
});

/**
 * Re-reads the session after sign-in/up, org changes or invitations. (invalidateQueries alone
 * won't refetch when no component is observing `me`, and route guards read the cache.)
 */
export const refreshMe = (qc: QueryClient) => qc.fetchQuery({ ...meQuery, staleTime: 0 });

export const publicConfigQuery = queryOptions({
  queryKey: ['public-config'],
  queryFn: () => api<{ googleEnabled: boolean }>('/public-config'),
  staleTime: Infinity,
});

export const sitesQuery = (orgId: string) =>
  queryOptions({
    queryKey: ['orgs', orgId, 'sites'],
    queryFn: ({ signal }) => api<{ sites: Site[] }>('/sites', { signal }).then((r) => r.sites),
  });

export const siteQuery = (orgId: string, siteId: string) =>
  queryOptions({
    queryKey: ['orgs', orgId, 'sites', siteId],
    queryFn: ({ signal }) => api<{ site: Site }>(`/sites/${siteId}`, { signal }).then((r) => r.site),
  });

/** The signed-in user + active org; only call inside the authenticated shell. */
export function useMe() {
  const { data } = useQuery(meQuery);
  if (!data || !data.activeOrgId) throw new Error('useMe called outside the authenticated app shell');
  const activeOrg = data.orgs.find((o) => o.id === data.activeOrgId)!;
  return { me: data, orgId: data.activeOrgId, activeOrg, role: activeOrg.role };
}

/** Date formatting in the user's language and preferred calendar. */
export function useFormatDate() {
  const { i18n } = useTranslation();
  const { data } = useQuery(meQuery);
  const locale = i18n.language as Locale;
  const calendar = (data?.user.calendar ?? undefined) as CalendarPref | undefined;
  return (date: Date | string, withTime = false) => formatDate(date, { locale, calendar, withTime });
}

export const installQuery = (orgId: string, siteId: string) =>
  queryOptions({
    queryKey: ['orgs', orgId, 'sites', siteId, 'install'],
    queryFn: ({ signal }) => api<SiteInstall>(`/sites/${siteId}/install`, { signal }),
  });

export const todayQuery = (orgId: string) =>
  queryOptions({
    queryKey: ['orgs', orgId, 'today'],
    queryFn: ({ signal }) => api<Today>('/today', { signal }),
    refetchInterval: 60_000,
  });

/** Site insights from the daily rollups (refreshed by the worker every 10 minutes). */
export const siteInsightsQuery = (orgId: string, siteId: string, range: InsightsRange) =>
  queryOptions({
    queryKey: ['orgs', orgId, 'sites', siteId, 'insights', range],
    queryFn: ({ signal }) => api<SiteInsights>(`/sites/${siteId}/insights?range=${range}`, { signal }),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

export const siteFunnelQuery = (orgId: string, siteId: string) =>
  queryOptions({
    queryKey: ['orgs', orgId, 'sites', siteId, 'funnel'],
    queryFn: ({ signal }) => api<SiteFunnel>(`/sites/${siteId}/funnel`, { signal }),
  });

/** Today's "this week" panel across the organization's sites. */
export const weekQuery = (orgId: string) =>
  queryOptions({
    queryKey: ['orgs', orgId, 'insights', 'week'],
    queryFn: ({ signal }) => api<WeekSummary>('/insights/week', { signal }),
    staleTime: 60_000,
    retry: (n, e) => !(e instanceof ApiError && e.status === 403) && n < 2,
  });
