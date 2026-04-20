import * as vscode from 'vscode';
import { LineageClient } from './lineage-client';

// One decoration type — dim italic text appended after the line
const DECO_TYPE = vscode.window.createTextEditorDecorationType({
  after: {
    color: new vscode.ThemeColor('editorCodeLens.foreground'),
    fontStyle: 'italic',
    margin: '0 0 0 2em',
  },
  rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
});

// Matches column definitions inside a CREATE TABLE body: `col_name TYPE ...`
const COL_RE = /^\s{1,}(\w+)\s+\w/gm;
const SKIP_KEYWORDS = new Set([
  'PRIMARY', 'FOREIGN', 'UNIQUE', 'INDEX', 'KEY',
  'CONSTRAINT', 'CHECK', 'CREATE', 'NOT',
]);

// Extract column names from a CREATE TABLE block (between first ( and matching ))
function extractColumns(body: string): string[] {
  const cols: string[] = [];
  COL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = COL_RE.exec(body)) !== null) {
    const name = m[1];
    if (!SKIP_KEYWORDS.has(name.toUpperCase())) cols.push(name);
  }
  return cols;
}

export class SqlDecorationProvider {
  private disposables: vscode.Disposable[] = [];

  constructor(private readonly client: LineageClient) {
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((e) => {
        if (e?.document.languageId === 'sql') this.decorate(e);
      }),
      vscode.workspace.onDidSaveTextDocument((doc) => {
        const e = vscode.window.activeTextEditor;
        if (e && e.document === doc && doc.languageId === 'sql') this.decorate(e);
      }),
    );

    // Decorate immediately if a SQL file is already open
    const active = vscode.window.activeTextEditor;
    if (active?.document.languageId === 'sql') this.decorate(active);
  }

  private async decorate(editor: vscode.TextEditor): Promise<void> {
    const text = editor.document.getText();
    const decos: vscode.DecorationOptions[] = [];

    // Find every CREATE TABLE block
    const tableBlockRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\(([\s\S]*?)\);/gi;
    let tableMatch: RegExpExecArray | null;

    while ((tableMatch = tableBlockRe.exec(text)) !== null) {
      const tableName = tableMatch[1];
      const body = tableMatch[2];
      const bodyStart = tableMatch.index + tableMatch[0].indexOf('(') + 1;

      let consumerCount = 0;
      try {
        const result = await this.client.listLineage(tableName);
        consumerCount = result.consumers?.length ?? 0;
      } catch {
        continue;
      }

      if (consumerCount === 0) continue;

      // Add a decoration to each column line in this table block
      const cols = extractColumns(body);
      for (const col of cols) {
        // Find the column's position in the full document
        const colRe = new RegExp(`\\b${col}\\b`, 'i');
        const colIdx = bodyStart + body.search(colRe);
        if (colIdx < bodyStart) continue;

        const colPos = editor.document.positionAt(colIdx);
        const lineEnd = editor.document.lineAt(colPos.line).range.end;

        decos.push({
          range: new vscode.Range(lineEnd, lineEnd),
          renderOptions: {
            after: {
              contentText: `← ${consumerCount} file${consumerCount !== 1 ? 's' : ''} use ${tableName}`,
            },
          },
        });
      }
    }

    editor.setDecorations(DECO_TYPE, decos);
  }

  dispose(): void {
    DECO_TYPE.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}
