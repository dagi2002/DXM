import type { Today } from '@pulse/contracts';
import { sql, withOrg } from '@pulse/db';
import { Hono } from 'hono';
import type { AppDeps } from '../app';
import { requireOrg, requireSession } from '../guards';
import type { AppEnv } from '../http';

/** Per-site pulse for the Today screen: is data flowing, and how much in the last 24 h. */
export function todayRoutes(deps: AppDeps) {
  const r = new Hono<AppEnv>();
  r.use('*', requireSession(deps), requireOrg(deps));
  r.get('/', async (c) => {
    if (c.get('role') === 'client_viewer') return c.json({ sites: [] } satisfies Today);
    const rows = await withOrg(deps.db, c.get('orgId')!, (tx) =>
      tx.execute<{
        id: string;
        name: string;
        domain: string;
        status: 'install' | 'live' | 'paused';
        visits: number;
        pageviews: number;
        last: Date | null;
      }>(sql`
        select s.id, s.name, s.domain, s.status,
               coalesce(v.visits, 0)::int as visits,
               coalesce(v.pageviews, 0)::int as pageviews,
               v.last
        from sites s
        left join lateral (
          select count(*) as visits, sum(pageviews) as pageviews, max(last_seen_at) as last
          from visits where site_id = s.id and started_at > now() - interval '24 hours'
        ) v on true
        where s.deleted_at is null
        order by s.created_at`),
    );
    const body: Today = {
      sites: rows.rows.map((s) => ({
        id: s.id,
        name: s.name,
        domain: s.domain,
        status: s.status,
        visits24h: Number(s.visits),
        pageviews24h: Number(s.pageviews),
        lastEventAt: s.last ? new Date(s.last).toISOString() : null,
      })),
    };
    return c.json(body);
  });
  return r;
}
