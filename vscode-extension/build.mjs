#!/usr/bin/env node
import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const withTests = process.argv.includes('--tests');

// ── Extension bundle ────────────────────────────────────────────────────────
const extCtx = await esbuild.context({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  sourcemap: true,
  minify: false,
});

// ── Test bundles (only when --tests flag is passed) ─────────────────────────
let testCtxs = [];
if (withTests || watch) {
  // runTests.ts runs OUTSIDE VS Code — no vscode external needed
  testCtxs.push(
    await esbuild.context({
      entryPoints: ['src/test/runTests.ts'],
      bundle: true,
      outfile: 'dist/test/runTests.js',
      platform: 'node',
      format: 'cjs',
      target: 'node18',
      sourcemap: true,
    }),
  );

  // Suite files run INSIDE VS Code — vscode is external, mocha is external
  testCtxs.push(
    await esbuild.context({
      entryPoints: ['src/test/suite/index.ts'],
      bundle: true,
      outfile: 'dist/test/suite/index.js',
      external: ['vscode', 'mocha'],
      platform: 'node',
      format: 'cjs',
      target: 'node18',
      sourcemap: true,
    }),
  );

  testCtxs.push(
    await esbuild.context({
      entryPoints: ['src/test/suite/extension.test.ts'],
      bundle: true,
      outfile: 'dist/test/suite/extension.test.js',
      external: ['vscode', 'mocha'],
      platform: 'node',
      format: 'cjs',
      target: 'node18',
      sourcemap: true,
    }),
  );
}

const allCtxs = [extCtx, ...testCtxs];

if (watch) {
  await Promise.all(allCtxs.map((c) => c.watch()));
  console.log('[lineage-ext] watching for changes…');
} else {
  await Promise.all(allCtxs.map((c) => c.rebuild()));
  await Promise.all(allCtxs.map((c) => c.dispose()));
  console.log('[lineage-ext] build complete →', withTests ? 'extension + tests' : 'extension only');
}
