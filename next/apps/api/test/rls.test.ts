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
        'audit_log',
        'events',
        'ingest_dedupe',
        'org_plans',
        'report_shares',
        'reports',
        'sites',
        'visits',
      ]),
    );
    const unprotected = rows.filter((r) => !r.rls || !r.forced || r.policies === 0).map((r) => r.table);
    expect(unprotected).toEqual([]);
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
        'reports',
        'report_shares',
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
