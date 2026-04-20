/**
 * Bridge integration tests — run without VS Code.
 *
 * These tests spawn the lineage-bridge.mjs process and verify that the data
 * driving CodeLens ("N dependent files") and inline decorations ("← N files")
 * is correct.  They are the headless proof that the UI layer would show the
 * right information.
 *
 * Run:  node vscode-extension/src/test/integration/bridge.test.mjs
 */

import { spawn } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BRIDGE = resolve(__dirname, '../../../../lineage-bridge.mjs');
const FIXTURES = resolve(__dirname, '../../../../test-fixtures');

// ── tiny test framework ──────────────────────────────────────────────────────
let passed = 0, failed = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗  ${name}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg ?? 'assertion failed'); }
function assertEqual(a, b) { if (a !== b) throw new Error(`expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }

// ── bridge client ────────────────────────────────────────────────────────────
async function callBridge(proc, method, params) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1e6);
    let buf = '';

    const onData = (chunk) => {
      buf += chunk;
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id === id) {
            proc.stdout.off('data', onData);
            msg.error ? reject(new Error(msg.error)) : resolve(msg.result);
          }
        } catch { /* ignore */ }
      }
    };

    proc.stdout.on('data', onData);
    proc.stdin.write(JSON.stringify({ id, method, params: { ...params, rootDir: FIXTURES } }) + '\n');

    setTimeout(() => {
      proc.stdout.off('data', onData);
      reject(new Error(`timeout: ${method}`));
    }, 30_000);
  });
}

// ── main ─────────────────────────────────────────────────────────────────────
console.log('\n  Lineage Bridge — Integration Tests');
console.log('  ─────────────────────────────────────');
console.log(`  fixtures: ${FIXTURES}\n`);

// Spawn the bridge once and reuse it for all tests
const bridge = spawn('node', [BRIDGE], {
  cwd: resolve(__dirname, '../../../..'),
  stdio: ['pipe', 'pipe', 'pipe'],
});
bridge.stderr.on('data', (d) => process.stderr.write(`[bridge] ${d}`));
bridge.stdout.setEncoding('utf-8');

// ── tests ────────────────────────────────────────────────────────────────────

await test('list_tables discovers SQL tables from test-fixtures', async () => {
  const tables = await callBridge(bridge, 'list_tables', {});
  assert(Array.isArray(tables), 'expected an array');
  assert(tables.length >= 1, `expected at least 1 table, got ${tables.length}`);
  console.log(`     tables found: ${tables.join(', ')}`);
});

await test('list_lineage for "users" returns consumers (drives CodeLens count)', async () => {
  const result = await callBridge(bridge, 'list_lineage', { table: 'users' });
  assert(result.consumers, 'expected consumers array');
  assert(result.consumers.length > 0, `expected consumers, got 0 — CodeLens would show "No dependents"`);
  console.log(`     consumers found: ${result.consumers.length}`);
  result.consumers.forEach(c => console.log(`       • ${c.filePath}:${c.line}  [${c.confidence}]  ${c.pattern}`));
});

await test('list_lineage tree is non-empty (drives lineage panel)', async () => {
  const result = await callBridge(bridge, 'list_lineage', { table: 'users' });
  assert(typeof result.tree === 'string', 'expected tree string');
  assert(result.tree.length > 0, 'expected non-empty lineage tree');
  console.log(`     tree preview: ${result.tree.split('\n').slice(0, 3).join(' | ')}`);
});

await test('check_impact rename returns affected files (drives impact panel)', async () => {
  const result = await callBridge(bridge, 'check_impact', {
    table: 'users',
    column: 'email',
    changeType: 'rename',
    newName: 'user_email',
  });
  assert(result.affectedFiles, 'expected affectedFiles array');
  assert(result.affectedFiles.length > 0, 'expected at least 1 affected file');
  console.log(`     affected files: ${result.affectedFiles.length}`);
  result.affectedFiles.forEach(f => console.log(`       • ${f.filePath}:${f.line}  [${f.confidence}]`));
});

await test('inline decoration data: users table has ≥3 consumers (drives "← N files")', async () => {
  const result = await callBridge(bridge, 'list_lineage', { table: 'users' });
  const n = result.consumers.length;
  assert(n >= 3, `expected ≥3 consumers to show meaningful decoration, got ${n}`);
  console.log(`     decoration would show: ← ${n} files use users`);
});

await test('CodeLens title for users would be non-zero', async () => {
  const result = await callBridge(bridge, 'list_lineage', { table: 'users' });
  const n = result.consumers.length;
  const title = n > 0
    ? `⚡ ${n} dependent file${n !== 1 ? 's' : ''} — view lineage`
    : '✓ No dependents';
  assert(title.includes('dependent files'), `expected "dependent files" in title, got: "${title}"`);
  console.log(`     CodeLens would show: "${title}"`);
});

// ── summary ──────────────────────────────────────────────────────────────────
bridge.kill();

console.log();
console.log(`  ${passed + failed} tests  •  ${passed} passed  •  ${failed} failed`);
console.log();

if (failed > 0) {
  console.error('  Some tests failed. Run `npm run build` in the project root and retry.\n');
  process.exit(1);
}

console.log('  ✓ All bridge tests passed.');
console.log('  → To see CodeLens + decorations visually:');
console.log('    1. code vscode-extension/');
console.log('    2. Press F5 (opens Extension Development Host)');
console.log('    3. Open test-fixtures/sql/schema.sql\n');
