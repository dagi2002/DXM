import { getAuthTables } from 'better-auth/db';
import { authOptions } from '../src/auth';
import { MemoryMailer } from '@pulse/mail';

const env = {
  NODE_ENV: 'development',
  API_URL: 'http://x',
  APP_URL: 'http://x',
  TRUSTED_ORIGINS: [],
  BETTER_AUTH_SECRET: 'x'.repeat(32),
} as never;
const tables = getAuthTables(authOptions({ db: {} as never, env, mailer: new MemoryMailer() }));
for (const [key, tbl] of Object.entries(tables)) {
  console.log(`\n## ${key} -> ${tbl.modelName}`);
  for (const [f, attr] of Object.entries(tbl.fields)) {
    const a = attr as {
      type: unknown;
      required?: boolean;
      unique?: boolean;
      references?: { model: string; field: string; onDelete?: string };
      defaultValue?: unknown;
      index?: boolean;
      fieldName?: string;
    };
    console.log(
      `  ${f}${a.fieldName && a.fieldName !== f ? `(${a.fieldName})` : ''}: ${JSON.stringify(a.type)} req=${a.required !== false} uniq=${!!a.unique} idx=${!!a.index} ref=${a.references ? `${a.references.model}.${a.references.field}/${a.references.onDelete ?? ''}` : ''} def=${typeof a.defaultValue === 'function' ? 'fn' : JSON.stringify(a.defaultValue)}`,
    );
  }
}
