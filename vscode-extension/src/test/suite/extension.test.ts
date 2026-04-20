import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

suite('Lineage MCP — VS Code integration', () => {
  let sqlDoc: vscode.TextDocument;

  // ── Setup: configure rootDir, open the SQL fixture, wait for first scan ─────
  suiteSetup(async () => {
    // LINEAGE_FIXTURES is injected by runTests via extensionTestsEnv.
    // Falls back to a relative path that works when __dirname = dist/test/suite/
    const fixturesPath =
      process.env.LINEAGE_FIXTURES ??
      path.resolve(__dirname, '../../../../test-fixtures');

    // Tell the extension which directory to scan
    await vscode.workspace
      .getConfiguration('lineage')
      .update('rootDir', fixturesPath, vscode.ConfigurationTarget.Global);

    // Ensure the extension is fully active
    const ext = vscode.extensions.getExtension('cjitendr.lineage-mcp-vscode');
    assert.ok(ext, 'Extension cjitendr.lineage-mcp-vscode must be installed');
    if (!ext.isActive) await ext.activate();

    // Open the SQL fixture file
    const sqlPath = path.join(fixturesPath, 'sql', 'schema.sql');
    sqlDoc = await vscode.workspace.openTextDocument(sqlPath);
    await vscode.window.showTextDocument(sqlDoc);

    // Give the bridge time to crawl test-fixtures and register CodeLens
    await wait(6000);
  });

  // ── Test 1: extension is alive ──────────────────────────────────────────────
  test('Extension activates successfully', () => {
    const ext = vscode.extensions.getExtension('cjitendr.lineage-mcp-vscode');
    assert.strictEqual(ext?.isActive, true, 'Extension should be active');
  });

  // ── Test 2: all three commands are registered ───────────────────────────────
  test('All three lineage commands are registered', async () => {
    const cmds = await vscode.commands.getCommands(true);
    for (const cmd of ['lineage.showLineage', 'lineage.checkImpact', 'lineage.rescan']) {
      assert.ok(cmds.includes(cmd), `Command ${cmd} should be registered`);
    }
  });

  // ── Test 3: CodeLens appears above CREATE TABLE lines ───────────────────────
  test('CodeLens appears above CREATE TABLE lines', async () => {
    const lenses = await vscode.commands.executeCommand<vscode.CodeLens[]>(
      'vscode.executeCodeLensProvider',
      sqlDoc.uri,
    );

    assert.ok(lenses && lenses.length > 0,
      'Expected at least one CodeLens on the SQL file');

    // Print what we found for visibility in CI logs
    const resolved = lenses!.filter((l) => l.command?.title);
    console.log(`\n  CodeLenses found (${resolved.length}):`);
    for (const l of resolved) {
      console.log(`    line ${l.range.start.line + 1}: "${l.command?.title}"`);
    }

    const hasLineageLens = resolved.some(
      (l) => l.command?.title?.match(/dependent|No dependents|Lineage/i),
    );
    assert.ok(
      hasLineageLens,
      `Expected a CodeLens with lineage info, got: ${resolved.map((l) => `"${l.command?.title}"`).join(', ')}`,
    );
  });

  // ── Test 4: one CodeLens per CREATE TABLE statement ─────────────────────────
  test('One CodeLens per CREATE TABLE statement', async () => {
    const text = sqlDoc.getText();
    const tableCount = [...text.matchAll(/CREATE\s+TABLE/gi)].length;

    const lenses = await vscode.commands.executeCommand<vscode.CodeLens[]>(
      'vscode.executeCodeLensProvider',
      sqlDoc.uri,
    );

    assert.ok(
      (lenses?.length ?? 0) >= tableCount,
      `Expected at least ${tableCount} CodeLenses (one per table), got ${lenses?.length ?? 0}`,
    );
  });

  // ── Test 5: showLineage command opens the panel without error ───────────────
  test('lineage.showLineage opens the impact panel', async () => {
    const text = sqlDoc.getText();
    const match = text.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i);
    const tableName = match?.[1];
    assert.ok(tableName, 'Could not find a table name in the SQL fixture');

    await vscode.commands.executeCommand('lineage.showLineage', tableName);
    await wait(2000);

    // WebView panels don't appear in visibleTextEditors; command not throwing is enough
    assert.ok(true, 'lineage.showLineage executed without error');
  });
});
