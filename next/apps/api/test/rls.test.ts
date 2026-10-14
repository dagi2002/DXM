import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { TEST_DATABASE_URL, adminQuery } from './helpers';

const APP_ROLE = new URL(TEST_DATABASE_URL).username;

/**
 * Database-level guarantees that tenant isolation rests on (ADR-002). These catch a new
 * org-scoped table shipped without RLS, or an app role that silently gained BYPASSRLS.
 */
describe('row-level security invariants', () => {
  it('the app role is neither superuser nor BYPASSRLS', async () => {
    const { rows } = await adminQuery<{ rolsuper: boolean; rolbypassrls: boolean }>(
      'select rolsuper, rolbypassrls from pg_roles where rolname = $1',
      [APP_ROLE],
    );
    expect(rows).toEqual([{ rolsuper: false, rolbypassrls: false }]);
  });

  it('every table with an org_id column has RLS enabled, forced, and a policy', async () => {
    const { rows } = await adminQuery<{ table: string; rls: boolean; forced: boolean; policies: number }>(`
      select c.relname as table, c.relrowsecurity as rls, c.relforcerowsecurity as forced,
             (select count(*)::int from pg_policy p where p.polrelid = c.oid) as policies
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p')
        and exists (select 1 from pg_attribute a
                    where a.attrelid = c.oid and a.attname = 'org_id' and not a.attisdropped)
      order by 1`);
    expect(rows.map((r) => r.table)).toEqual(
      expect.arrayContaining([
        'ai_artifacts',
        'audit_log',
        'events',
        'ingest_dedupe',
        'issue_events',
        'issues',
        'org_plans',
        'replay_chunks',
        'rollup_funnel_day',
        'rollup_page_day',
        'rollup_site_day',
        'rollup_vitals_day',
        'site_funnels',
        'sites',
        'telegram_link_codes',
        'telegram_links',
        'visits',
      ]),
    );
    const unprotected = rows.filter((r) => !r.rls || !r.forced || r.policies === 0).map((r) => r.table);
    expect(unprotected).toEqual([]);
  });

  it('lets the app role call the slice 3 helpers but not write link codes into another org', async () => {
    const { rows } = await adminQuery<{ verify: boolean; live: boolean; claim: boolean; pub: boolean }>(
      `select has_function_privilege($1, 'pulse_issues_due_for_verification(integer, integer, integer)', 'EXECUTE') as verify,
              has_function_privilege($1, 'pulse_live_sites()', 'EXECUTE') as live,
              has_function_privilege($1, 'pulse_claim_telegram_link(text, text, text, text)', 'EXECUTE') as claim,
              has_function_privilege('public', 'pulse_claim_telegram_link(text, text, text, text)', 'EXECUTE') as pub`,
      [APP_ROLE],
    );
    expect(rows[0]).toEqual({ verify: true, live: true, claim: true, pub: false });
    const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    try {
      await client.query(`select set_config('app.org_id', 'org_mine', false)`);
      await expect(
        client.query(
          `insert into telegram_link_codes (code_hash, org_id, expires_at) values ('x', 'org_other', now())`,
        ),
      ).rejects.toThrow(/row-level security|violates/);
    } finally {
      await client.end();
    }
  });

  it('keeps the audit log append-only and internal helpers private for the app role', async () => {
    const { rows } = await adminQuery<{ upd: boolean; del: boolean; ins: boolean; protect: boolean }>(
      `select has_table_privilege($1, 'audit_log', 'UPDATE') as upd,
              has_table_privilege($1, 'audit_log', 'DELETE') as del,
              has_table_privilege($1, 'audit_log', 'INSERT') as ins,
              has_function_privilege($1, 'pulse_protect_partition(text)', 'EXECUTE') as protect`,
      [APP_ROLE],
    );
    expect(rows[0]).toEqual({ upd: false, del: false, ins: true, protect: false });
  });

  it('shows the app role no tenant rows when no org is set', async () => {
    const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    try {
      for (const table of [
        'sites',
        'audit_log',
        'visits',
        'events',
        'org_plans',
        'rollup_site_day',
        'site_funnels',
        'issues',
        'telegram_links',
        'telegram_link_codes',
        'ai_artifacts',
      ]) {
        const { rows } = await client.query(`select count(*)::int as n from ${table}`);
        expect(rows[0].n, table).toBe(0);
      }
      await expect(
        client.query(
          `insert into audit_log (id, org_id, action, target_type, target_id) values ('x', 'org_x', 'a', 't', 'x')`,
        ),
      ).rejects.toThrow(/row-level security|violates/);
    } finally {
      await client.end();
    }
  });
});
