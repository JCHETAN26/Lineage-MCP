import * as vscode from 'vscode';
import { LineageResult, ImpactResult } from './lineage-client';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function confBadge(conf: string): string {
  const cls = conf.toLowerCase();
  return `<span class="badge ${cls}">${conf}</span>`;
}

function lineageHtml(data: LineageResult): string {
  const title = data.asset.column
    ? `${data.asset.table}.${data.asset.column}`
    : data.asset.table;

  const consumersRows = (data.consumers ?? [])
    .map(
      (c) =>
        `<tr>
          <td><code>${esc(c.filePath)}:${c.line}</code></td>
          <td><code>${esc(c.pattern)}</code></td>
          <td>${esc(c.provenance ?? 'unknown')}</td>
          <td>${confBadge(c.confidence)}</td>
        </tr>`,
    )
    .join('');

  const upstreamRows = (data.upstream ?? [])
    .map(
      (u) =>
        `<tr><td><strong>${esc(u.name)}</strong></td><td><code>${esc(u.filePath)}:${u.line}</code></td></tr>`,
    )
    .join('');

  return `
    <h2>🔗 Lineage: <code>${esc(title)}</code></h2>
    <pre class="tree">${esc(data.tree ?? '')}</pre>

    ${
      data.consumers?.length
        ? `<h3>Consumers (${data.consumers.length})</h3>
           <table>
             <thead><tr><th>File</th><th>Pattern</th><th>Source</th><th>Confidence</th></tr></thead>
             <tbody>${consumersRows}</tbody>
           </table>`
        : '<p class="muted">No consumers found for this asset.</p>'
    }

    ${
      data.upstream?.length
        ? `<h3>Upstream Tables</h3>
           <table>
             <thead><tr><th>Table</th><th>Defined at</th></tr></thead>
             <tbody>${upstreamRows}</tbody>
           </table>`
        : ''
    }
  `;
}

function impactHtml(data: ImpactResult): string {
  const asset = data.changedAsset;
  const title = asset.column ? `${asset.table}.${asset.column}` : asset.table;

  const rows = (data.affectedFiles ?? [])
    .map(
      (f) => `
        <tr>
          <td><code>${esc(f.filePath)}:${f.line}</code></td>
          <td>${confBadge(f.confidence)}</td>
          <td>${esc(f.provenance ?? 'unknown')}</td>
          <td class="snippet">${f.snippet ? `<pre>${esc(f.snippet)}</pre>` : '—'}</td>
          <td>${f.suggestedFix ? `<em>${esc(f.suggestedFix)}</em>` : '—'}</td>
        </tr>`,
    )
    .join('');

  return `
    <h2>⚠ Impact Report: <code>${esc(title)}</code></h2>
    <p><strong>Change:</strong> ${esc(asset.changeType)}${asset.newName ? ` → <code>${esc(asset.newName)}</code>` : ''}</p>
    <p class="summary">${esc(data.summary)}</p>

    ${
      data.affectedFiles?.length
        ? `<table>
             <thead><tr><th>File</th><th>Confidence</th><th>Source</th><th>Snippet</th><th>Fix</th></tr></thead>
             <tbody>${rows}</tbody>
           </table>`
        : '<p class="muted">No files affected.</p>'
    }
  `;
}

const PANEL_CSS = `
  body {
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 13px;
    padding: 20px 28px;
    color: var(--vscode-editor-foreground);
    background: var(--vscode-editor-background);
    line-height: 1.6;
  }
  h2 { color: var(--vscode-textLink-foreground); margin-bottom: 4px; }
  h3 { color: var(--vscode-textLink-foreground); margin: 20px 0 8px; }
  pre.tree {
    background: var(--vscode-textCodeBlock-background);
    padding: 12px 16px;
    border-radius: 6px;
    overflow-x: auto;
    white-space: pre;
  }
  table { border-collapse: collapse; width: 100%; margin-top: 4px; }
  th {
    text-align: left;
    padding: 6px 12px;
    border-bottom: 2px solid var(--vscode-panel-border, #333);
    color: var(--vscode-descriptionForeground);
    font-weight: 600;
  }
  td {
    padding: 6px 12px;
    border-bottom: 1px solid var(--vscode-panel-border, #333);
    vertical-align: top;
  }
  code { font-family: var(--vscode-editor-font-family, monospace); }
  .snippet pre { margin: 0; font-size: 11px; }
  .muted { color: var(--vscode-descriptionForeground); font-style: italic; }
  .summary { margin: 8px 0 16px; }
  .badge {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 3px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
  }
  .badge.high   { background: #3d1f1f; color: #f85149; }
  .badge.medium { background: #3d2e0a; color: #e3b341; }
  .badge.low    { background: #1e2228; color: #8b949e; }
`;

export class ImpactPanel {
  static current: ImpactPanel | undefined;

  private constructor(private readonly panel: vscode.WebviewPanel) {
    panel.onDidDispose(() => { ImpactPanel.current = undefined; });
    this.show('<h2>⟳ Loading…</h2>');
  }

  static createOrShow(extensionUri: vscode.Uri): ImpactPanel {
    if (ImpactPanel.current) {
      ImpactPanel.current.panel.reveal(vscode.ViewColumn.Beside);
      return ImpactPanel.current;
    }
    const panel = vscode.window.createWebviewPanel(
      'lineageImpact',
      'Lineage',
      vscode.ViewColumn.Beside,
      { enableScripts: false, retainContextWhenHidden: true },
    );
    ImpactPanel.current = new ImpactPanel(panel);
    return ImpactPanel.current;
  }

  showLineage(data: LineageResult): void {
    this.panel.title = `Lineage — ${data.asset.column ? `${data.asset.table}.${data.asset.column}` : data.asset.table}`;
    this.show(lineageHtml(data));
  }

  showImpact(data: ImpactResult): void {
    const asset = data.changedAsset;
    this.panel.title = `Impact — ${asset.column ? `${asset.table}.${asset.column}` : asset.table}`;
    this.show(impactHtml(data));
  }

  private show(body: string): void {
    this.panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><style>${PANEL_CSS}</style></head>
<body>${body}</body>
</html>`;
  }
}
