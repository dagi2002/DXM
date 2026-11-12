// Fails when the JavaScript needed for first load exceeds the budget (docs/rebuild/03 §8).
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

// "First load" here is the JS that index.html itself pulls in (the entry and its modulepreloads):
// the shell every route shares. The route's own chunk and the active locale load on top of it.
// 2026-11-12 (task 12): 154.0 KB measured, down from 216.0. The budget is the measured number
// plus 2 KB of headroom; lower it again when the shell shrinks, never raise it to fit a feature.
// Lazy-load new screens and dialogs instead (docs/rebuild/03-architecture.md §8).
const BUDGET_KB = Number(process.env.BUNDLE_BUDGET_KB ?? 156);
const html = readFileSync('dist/index.html', 'utf8');
const files = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]);
let total = 0;
for (const f of files) {
  const gz = gzipSync(readFileSync(`dist/${f}`)).length;
  total += gz;
  console.log(`${(gz / 1024).toFixed(1).padStart(7)} KB  ${f}`);
}
console.log(`${(total / 1024).toFixed(1).padStart(7)} KB  initial JS (gzip), budget ${BUDGET_KB} KB`);
if (total / 1024 > BUDGET_KB) {
  console.error('Bundle budget exceeded.');
  process.exit(1);
}
