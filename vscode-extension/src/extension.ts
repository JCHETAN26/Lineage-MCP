import * as vscode from 'vscode';
import { LineageClient } from './lineage-client';
import { SqlCodeLensProvider } from './sql-codelens';
import { SqlDecorationProvider } from './sql-decorations';
import { ImpactPanel } from './impact-panel';
import { DebugLog } from './debug-log';

// Extracts table names from a SQL document text
function tablesInSql(text: string): string[] {
  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/gi;
  const names = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) names.add(m[1].toLowerCase());
  return [...names];
}

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('Lineage MCP');
  context.subscriptions.push(output);

  const rootDir =
    (vscode.workspace.getConfiguration('lineage').get<string>('rootDir') || '').trim() ||
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ||
    process.cwd();
  const debugLog = new DebugLog(output, rootDir, context.extension.packageJSON.version ?? 'unknown');
  debugLog.info(`Activating Lineage MCP with rootDir=${rootDir}`);

  if (context.extensionMode === vscode.ExtensionMode.Development) {
    void vscode.window.showInformationMessage(`Lineage MCP activated for ${rootDir}`);
  }

  const client = new LineageClient(rootDir, debugLog);
  context.subscriptions.push({ dispose: () => client.dispose() });

  // ── Providers ─────────────────────────────────────────────────────────────
  const codeLens = new SqlCodeLensProvider(client);
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider({ language: 'sql' }, codeLens),
    codeLens,
  );

  const decorations = new SqlDecorationProvider(client);
  context.subscriptions.push(decorations);

  // ── Commands ───────────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('lineage.rescan', async () => {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Lineage: scanning…' },
        async () => {
          try {
            const { tables, deps } = await client.scan();
            debugLog.info(`Scan complete tables=${tables} dependencies=${deps}`);
            vscode.window.showInformationMessage(
              `Lineage: scan complete — ${tables} tables, ${deps} dependencies`,
            );
            codeLens.refresh();
          } catch (err) {
            debugLog.error(`Scan failed: ${(err as Error).stack ?? (err as Error).message}`);
            vscode.window.showErrorMessage(`Lineage scan failed: ${(err as Error).message}`);
          }
        },
      );
    }),

    vscode.commands.registerCommand('lineage.showLineage', async (table?: string) => {
      // If called from the command palette without args, prompt
      if (!table) {
        try {
          const tables = await client.listTables();
          table = await vscode.window.showQuickPick(tables, {
            placeHolder: 'Select a table to inspect',
          });
        } catch {
          table = await vscode.window.showInputBox({ prompt: 'Enter table name' });
        }
      }
      if (!table) return;

      const panel = ImpactPanel.createOrShow(context.extensionUri);
      try {
        const result = await client.listLineage(table);
        debugLog.info(`Loaded lineage table=${table} consumers=${result.consumers?.length ?? 0}`);
        panel.showLineage(result);
      } catch (err) {
        debugLog.error(`Show lineage failed: ${(err as Error).stack ?? (err as Error).message}`);
        vscode.window.showErrorMessage(`Lineage error: ${(err as Error).message}`);
      }
    }),

    vscode.commands.registerCommand('lineage.checkImpact', async () => {
      const editor = vscode.window.activeTextEditor;
      const tables =
        editor?.document.languageId === 'sql'
          ? tablesInSql(editor.document.getText())
          : [];

      const table =
        tables.length === 1
          ? tables[0]
          : await vscode.window.showInputBox({ prompt: 'Table name', value: tables[0] ?? '' });
      if (!table) return;

      const column = await vscode.window.showInputBox({ prompt: 'Column name (leave blank for whole table)' });
      const changeType = await vscode.window.showQuickPick(
        ['rename', 'delete', 'type_change', 'add'],
        { placeHolder: 'Change type' },
      );
      if (!changeType) return;

      let newName: string | undefined;
      if (changeType === 'rename') {
        newName = await vscode.window.showInputBox({ prompt: 'New name' });
      }

      const panel = ImpactPanel.createOrShow(context.extensionUri);
      try {
        const result = await client.checkImpact(table, changeType, column || undefined, newName);
        debugLog.info(
          `Impact check for table=${table} column=${column ?? ''} changeType=${changeType} results=${result.affectedFiles.length}`,
        );
        panel.showImpact(result);
      } catch (err) {
        debugLog.error(`Check impact failed: ${(err as Error).stack ?? (err as Error).message}`);
        vscode.window.showErrorMessage(`Lineage error: ${(err as Error).message}`);
      }
    }),

    vscode.commands.registerCommand('lineage.exportDebugLog', async () => {
      try {
        const uri = await debugLog.export();
        if (!uri) return;
        debugLog.info(`Exported debug log to ${uri.fsPath}`);
        vscode.window.showInformationMessage(`Lineage: debug log exported to ${uri.fsPath}`);
      } catch (err) {
        debugLog.error(`Debug log export failed: ${(err as Error).stack ?? (err as Error).message}`);
        vscode.window.showErrorMessage(`Lineage debug log export failed: ${(err as Error).message}`);
      }
    }),
  );

  // ── On-save watcher ────────────────────────────────────────────────────────
  const autoScan = vscode.workspace.getConfiguration('lineage').get<boolean>('autoScanOnSave', true);
  if (autoScan) {
    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument(async (doc) => {
        if (doc.languageId !== 'sql') return;
        const tables = tablesInSql(doc.getText());
        if (tables.length === 0) return;

        // Invalidate cache so next CodeLens refresh picks up fresh data
        // (bridge handles this by re-crawling when cache is stale)
        for (const table of tables) {
          try {
            const result = await client.listLineage(table);
            const n = result.consumers?.length ?? 0;
            if (n > 0) {
              const action = await vscode.window.showWarningMessage(
                `⚠ Lineage: \`${table}\` has ${n} dependent file${n !== 1 ? 's' : ''}.`,
                'View Lineage',
                'Check Impact',
                'Dismiss',
              );
              if (action === 'View Lineage') {
                vscode.commands.executeCommand('lineage.showLineage', table);
              } else if (action === 'Check Impact') {
                vscode.commands.executeCommand('lineage.checkImpact');
              }
              break; // one warning per save is enough
            }
          } catch { /* network/bridge hiccup — skip silently */ }
        }

        codeLens.refresh();
      }),
    );
  }
}

export function deactivate(): void {
  // LineageClient disposal is handled via context.subscriptions
}
