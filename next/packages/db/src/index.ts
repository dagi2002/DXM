import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index';

export { schema };
/** Query helpers re-exported so every workspace uses this package's single drizzle-orm instance. */
export { and, asc, count, desc, eq, gt, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm';
export * from './schema/index';

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface Database {
  db: Db;
  pool: pg.Pool;
  close: () => Promise<void>;
}

export function createDatabase(url: string, opts: { max?: number } = {}): Database {
  const pool = new pg.Pool({ connectionString: url, max: opts.max ?? 10 });
  const db = drizzle(pool, { schema, casing: 'snake_case' });
  return { db, pool, close: () => pool.end() };
}

/**
 * Runs `fn` in a transaction scoped to one organization. Row-level security policies
 * read `app.org_id`, so tenant tables only ever expose this org's rows — even if a
 * query forgets its WHERE clause (ADR-002).
 */
export async function withOrg<T>(db: Db, orgId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!orgId) throw new Error('withOrg requires an orgId');
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
    return fn(tx);
  });
}

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** Random base62 string (rejection sampling keeps the distribution uniform). */
export function randomBase62(length: number): string {
  let out = '';
  while (out.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte < 248) out += BASE62[byte % 62];
      if (out.length === length) break;
    }
  }
  return out;
}

/** Prefixed, sortable-enough ids: site_7Hq2…, aud_… */
export const newId = (prefix: string) => `${prefix}_${randomBase62(20)}`;
/** Public site key embedded in tracking snippets. Not a secret, but unguessable. */
export const newPublicKey = () => `pk_${randomBase62(22)}`;
