/**
 * DXM Pulse SDK Build Script
 * Bundles packages/sdk/src/dxm.js and dxm-replay.js into packages/sdk/dist/
 * Usage:
 *   node build.js           — single build
 *   node build.js --watch   — rebuild on file changes
 */
import * as esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, 'src');
const DIST = path.join(__dirname, 'dist');
const watch = process.argv.includes('--watch');

if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true });

// ── Base SDK (dxm.js) — target <2kb minified ─────────────────────────────────
const baseConfig = {
  entryPoints: [path.join(SRC, 'dxm.js')],
  outfile: path.join(DIST, 'dxm.js'),
  bundle: true,          // keeps internal contract constants aligned
  minify: true,
  target: ['es5'],       // support old Android browsers & Telebirr WebView
  format: 'iife',
  platform: 'browser',
  logLevel: 'info',
};

// ── Replay SDK (dxm-replay.js) — ~30kb gzipped ───────────────────────────────
const replayConfig = {
  entryPoints: [path.join(SRC, 'dxm-replay.js')],
  outfile: path.join(DIST, 'dxm-replay.js'),
  bundle: true,          // bundles rrweb
  minify: true,
  target: ['es2017'],
  format: 'iife',
  platform: 'browser',
  external: [],
  logLevel: 'info',
};

async function build() {
  const [baseResult, replayResult] = await Promise.all([
    esbuild.build(baseConfig).catch(e => ({ errors: [e] })),
    esbuild.build(replayConfig).catch(e => ({ errors: [e] })),
  ]);

  // Report sizes
  const baseSize = fs.existsSync(baseConfig.outfile)
    ? (fs.statSync(baseConfig.outfile).size / 1024).toFixed(1) : 'N/A';
  const replaySize = fs.existsSync(replayConfig.outfile)
    ? (fs.statSync(replayConfig.outfile).size / 1024).toFixed(1) : 'N/A';

  console.log(`\n✅ Build complete:`);
  console.log(`   dist/dxm.js        ${baseSize}kb (target: <2kb)`);
  console.log(`   dist/dxm-replay.js ${replaySize}kb`);

  if (baseSize > 2) {
    console.warn(`\n⚠️  dxm.js exceeds 2kb target! Review and trim.`);
  }
}

if (watch) {
  const baseCtx = await esbuild.context(baseConfig);
  const replayCtx = await esbuild.context(replayConfig);
  await Promise.all([baseCtx.watch(), replayCtx.watch()]);
  console.log('👀 Watching for changes...');
} else {
  await build();
}
