/**
 * DXM Pulse SDK Build Script
 *
 * Bundles four entry points into packages/sdk/dist/:
 *   - src/dxm.js              → dist/dxm.js         (v1, FROZEN — served to existing customers)
 *   - src/dxm-replay.js       → dist/dxm-replay.js  (v1, FROZEN — served to existing customers)
 *   - src/v2/index.ts         → dist/dxm.v2.js      (v2, TypeScript, new features)
 *   - src/replay/index.ts     → dist/dxm-replay.v2.js
 *
 * v2 bundle has a gzip size gate (<15 KB) that fails the build if exceeded.
 *
 * Usage:
 *   node build.js           — single build
 *   node build.js --watch   — rebuild on file changes
 */
import * as esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import zlib from 'zlib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, 'src');
const DIST = path.join(__dirname, 'dist');
const watch = process.argv.includes('--watch');

if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true });

// ── v1 Base SDK (FROZEN) ──────────────────────────────────────────────────────
const v1BaseConfig = {
  entryPoints: [path.join(SRC, 'dxm.js')],
  outfile: path.join(DIST, 'dxm.js'),
  bundle: true,
  minify: true,
  target: ['es5'],
  format: 'iife',
  platform: 'browser',
  logLevel: 'info',
};

// ── v1 Replay SDK (FROZEN) ────────────────────────────────────────────────────
const v1ReplayConfig = {
  entryPoints: [path.join(SRC, 'dxm-replay.js')],
  outfile: path.join(DIST, 'dxm-replay.js'),
  bundle: true,
  minify: true,
  target: ['es2017'],
  format: 'iife',
  platform: 'browser',
  external: [],
  logLevel: 'info',
};

// ── v2 Base SDK (TypeScript, modular) ─────────────────────────────────────────
// v2 targets es2017 so TS source can use const/let/arrow functions without
// esbuild rejecting (it refuses to lower const to var under strict ES5). v1
// remains frozen at es5 for legacy device support; v2 is opt-in.
const v2BaseConfig = {
  entryPoints: [path.join(SRC, 'v2', 'index.ts')],
  outfile: path.join(DIST, 'dxm.v2.js'),
  bundle: true,
  minify: true,
  target: ['es2017'],
  format: 'iife',
  platform: 'browser',
  logLevel: 'info',
  loader: { '.ts': 'ts' },
};

// ── v2 Replay SDK ─────────────────────────────────────────────────────────────
const v2ReplayConfig = {
  entryPoints: [path.join(SRC, 'replay', 'index.ts')],
  outfile: path.join(DIST, 'dxm-replay.v2.js'),
  bundle: true,
  minify: true,
  target: ['es2017'],
  format: 'iife',
  platform: 'browser',
  external: [],
  logLevel: 'info',
  loader: { '.ts': 'ts' },
};

const V2_BASE_GZIP_BUDGET_KB = 15;

const kb = (bytes) => (bytes / 1024).toFixed(1);

const gzipSize = (filePath) => {
  if (!fs.existsSync(filePath)) return 0;
  return zlib.gzipSync(fs.readFileSync(filePath)).length;
};

async function build() {
  const [v1Base, v1Replay, v2Base, v2Replay] = await Promise.all([
    esbuild.build(v1BaseConfig).catch((e) => ({ errors: [e] })),
    esbuild.build(v1ReplayConfig).catch((e) => ({ errors: [e] })),
    esbuild.build(v2BaseConfig).catch((e) => ({ errors: [e] })),
    esbuild.build(v2ReplayConfig).catch((e) => ({ errors: [e] })),
  ]);

  const errors = [
    ...(v1Base.errors || []),
    ...(v1Replay.errors || []),
    ...(v2Base.errors || []),
    ...(v2Replay.errors || []),
  ];

  const v1BaseSize = fs.existsSync(v1BaseConfig.outfile) ? fs.statSync(v1BaseConfig.outfile).size : 0;
  const v1ReplaySize = fs.existsSync(v1ReplayConfig.outfile) ? fs.statSync(v1ReplayConfig.outfile).size : 0;
  const v2BaseSize = fs.existsSync(v2BaseConfig.outfile) ? fs.statSync(v2BaseConfig.outfile).size : 0;
  const v2ReplaySize = fs.existsSync(v2ReplayConfig.outfile) ? fs.statSync(v2ReplayConfig.outfile).size : 0;

  const v2BaseGz = gzipSize(v2BaseConfig.outfile);

  console.log('\n✅ Build complete:');
  console.log(`   dist/dxm.js           ${kb(v1BaseSize)}kb  [v1 FROZEN]`);
  console.log(`   dist/dxm-replay.js    ${kb(v1ReplaySize)}kb  [v1 FROZEN]`);
  console.log(`   dist/dxm.v2.js        ${kb(v2BaseSize)}kb raw / ${kb(v2BaseGz)}kb gzipped  [v2]`);
  console.log(`   dist/dxm-replay.v2.js ${kb(v2ReplaySize)}kb  [v2]`);

  if (errors.length > 0) {
    console.error('\n❌ Build errors:');
    for (const err of errors) console.error(err);
    process.exit(1);
  }

  // Gzip size gate for v2 base — fail CI if bloat creeps in
  const budgetBytes = V2_BASE_GZIP_BUDGET_KB * 1024;
  if (v2BaseGz > budgetBytes) {
    console.error(
      `\n❌ v2 base bundle exceeds gzip budget: ${kb(v2BaseGz)}kb > ${V2_BASE_GZIP_BUDGET_KB}kb. Trim before merging.`,
    );
    process.exit(1);
  }
}

if (watch) {
  const ctxs = await Promise.all([
    esbuild.context(v1BaseConfig),
    esbuild.context(v1ReplayConfig),
    esbuild.context(v2BaseConfig),
    esbuild.context(v2ReplayConfig),
  ]);
  await Promise.all(ctxs.map((c) => c.watch()));
  console.log('👀 Watching for changes (v1 + v2)...');
} else {
  await build();
}
