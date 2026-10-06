/**
 * Builds the browser SDK to dist/p.js and enforces the size budget (≤ 5 KB gzip, docs/rebuild/03 §6).
 * Also writes dist/manifest.json with the version and an SRI hash.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const BUDGETS: Record<string, number> = { 'p.js': 5 * 1024, 'v.js': 4.5 * 1024 };
const out = new URL('../dist/', import.meta.url);
mkdirSync(out, { recursive: true });

for (const [entry, file] of [
  ['index.ts', 'p.js'],
  ['vitals.ts', 'v.js'],
] as const) {
  await build({
    entryPoints: [fileURLToPath(new URL(`../src/${entry}`, import.meta.url))],
    outfile: fileURLToPath(new URL(file, out)),
    bundle: true,
    minify: true,
    format: 'iife',
    target: 'es2018', // Android Chrome 64+, iOS Safari 12+ — the long tail of Ethiopian handsets
    legalComments: 'none',
    define: { 'process.env.NODE_ENV': '"production"' },
  });
}

const manifest: Record<string, unknown> = { version: '3.0.0' };
let failed = false;
for (const file of Object.keys(BUDGETS)) {
  const code = readFileSync(new URL(file, out));
  const gz = gzipSync(code, { level: 9 }).length;
  manifest[file] = {
    bytes: code.length,
    gzip: gz,
    integrity: `sha384-${createHash('sha384').update(code).digest('base64')}`,
  };
  console.log(`${file} ${code.length} B, ${gz} B gzip (budget ${BUDGETS[file]} B)`);
  if (gz > BUDGETS[file]!) failed = true;
}
writeFileSync(new URL('manifest.json', out), JSON.stringify(manifest, null, 2));
if (failed) {
  console.error('SDK size budget exceeded');
  process.exit(1);
}
