import * as vscode from 'vscode';
import { LineageClient } from './lineage-client';

// Matches: CREATE TABLE [IF NOT EXISTS] tableName
const TABLE_RE = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/gi;

export class SqlCodeLensProvider implements vscode.CodeLensProvider {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChange.event;

  constructor(private readonly client: LineageClient) {}

  async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
    const text = document.getText();
    const lenses: vscode.CodeLens[] = [];
    TABLE_RE.lastIndex = 0;

    let m: RegExpExecArray | null;
    while ((m = TABLE_RE.exec(text)) !== null) {
      const table = m[1];
      const pos = document.positionAt(m.index);
      const range = new vscode.Range(pos, pos);

      // Kick off async fetch; fall back to a "scanning" lens if not ready
      const lens = new vscode.CodeLens(range);
      lenses.push(lens);

      // We resolve eagerly here — if it times out the lens just shows "scanning"
      try {
        const result = await this.client.listLineage(table);
        const n = result.consumers?.length ?? 0;
        lens.command = {
          title: n > 0
            ? `⚡ ${n} dependent file${n !== 1 ? 's' : ''} — view lineage`
            : `✓ No dependents`,
          command: n > 0 ? 'lineage.showLineage' : 'lineage.rescan',
          arguments: [table],
        };
      } catch {
        lens.command = {
          title: `⟳ Lineage (rescan to update)`,
          command: 'lineage.rescan',
          arguments: [],
        };
      }
    }

    return lenses;
  }

  refresh(): void {
    this._onDidChange.fire();
  }

  dispose(): void {
    this._onDidChange.dispose();
  }
}
