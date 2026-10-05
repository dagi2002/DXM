// Fails when the JavaScript needed for first load exceeds the budget (docs/rebuild/03 §8).
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

// Measured baseline for React 19 + React Aria + router + i18n (2026-10-05). Reduction plan in
// docs/rebuild/03-architecture.md §8 targets 160 KB; ratchet this down as items land.
const BUDGET_KB = Number(process.env.BUNDLE_BUDGET_KB ?? 220);
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
