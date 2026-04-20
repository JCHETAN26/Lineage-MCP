"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode5 = __toESM(require("vscode"));

// src/lineage-client.ts
var import_child_process = require("child_process");
var import_path = require("path");
var LineageClient = class {
  constructor(rootDir, logger) {
    this.rootDir = rootDir;
    this.logger = logger;
    this.proc = null;
    this.pending = /* @__PURE__ */ new Map();
    this.nextId = 1;
    this.buf = "";
    this.bridgePath = (0, import_path.join)(__dirname, "..", "..", "lineage-bridge.mjs");
  }
  ensureProc() {
    if (this.proc && !this.proc.killed)
      return this.proc;
    this.logger?.info(`Starting lineage bridge cwd=${this.rootDir}`);
    this.proc = (0, import_child_process.spawn)("node", [this.bridgePath], {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: this.rootDir
    });
    this.proc.stdout.setEncoding("utf-8");
    this.proc.stdout.on("data", (chunk) => {
      this.buf += chunk;
      const lines = this.buf.split("\n");
      this.buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim())
          continue;
        try {
          const msg = JSON.parse(line);
          this.logger?.info(`Bridge response id=${msg.id} error=${msg.error ? "yes" : "no"}`);
          const p = this.pending.get(msg.id);
          if (p) {
            this.pending.delete(msg.id);
            clearTimeout(p.timer);
            msg.error ? p.reject(new Error(msg.error)) : p.resolve(msg.result);
          }
        } catch {
        }
      }
    });
    this.proc.stderr.on("data", (d) => {
      const text = d.toString().trim();
      if (text)
        this.logger?.error(`Bridge stderr: ${text}`);
      process.stderr.write(`[lineage-bridge] ${d.toString()}`);
    });
    this.proc.on("exit", (code, signal) => {
      this.logger?.info(`Bridge exited code=${code ?? "null"} signal=${signal ?? "null"}`);
      this.proc = null;
    });
    return this.proc;
  }
  call(method, params) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.logger?.info(`Calling bridge method=${method} id=${id}`);
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.logger?.error(`Bridge timeout method=${method} id=${id}`);
        reject(new Error(`lineage timeout: ${method}`));
      }, 3e4);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.ensureProc().stdin.write(JSON.stringify({ id, method, params }) + "\n");
      } catch (err) {
        this.pending.delete(id);
        clearTimeout(timer);
        this.logger?.error(`Bridge write failed method=${method} id=${id}: ${err.message}`);
        reject(err);
      }
    });
  }
  scan() {
    return this.call("scan", { rootDir: this.rootDir });
  }
  listLineage(table, column) {
    return this.call("list_lineage", { table, column, rootDir: this.rootDir });
  }
  checkImpact(table, changeType, column, newName) {
    return this.call("check_impact", { table, column, changeType, newName, rootDir: this.rootDir });
  }
  listTables() {
    return this.call("list_tables", { rootDir: this.rootDir });
  }
  dispose() {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error("LineageClient disposed"));
    }
    this.pending.clear();
    this.proc?.kill();
    this.proc = null;
  }
};

// src/sql-codelens.ts
var vscode = __toESM(require("vscode"));
var TABLE_RE = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/gi;
var SqlCodeLensProvider = class {
  constructor(client) {
    this.client = client;
    this._onDidChange = new vscode.EventEmitter();
    this.onDidChangeCodeLenses = this._onDidChange.event;
  }
  async provideCodeLenses(document) {
    const text = document.getText();
    const lenses = [];
    TABLE_RE.lastIndex = 0;
    let m;
    while ((m = TABLE_RE.exec(text)) !== null) {
      const table = m[1];
      const pos = document.positionAt(m.index);
      const range = new vscode.Range(pos, pos);
      const lens = new vscode.CodeLens(range);
      lenses.push(lens);
      try {
        const result = await this.client.listLineage(table);
        const n = result.consumers?.length ?? 0;
        lens.command = {
          title: n > 0 ? `\u26A1 ${n} dependent file${n !== 1 ? "s" : ""} \u2014 view lineage` : `\u2713 No dependents`,
          command: n > 0 ? "lineage.showLineage" : "lineage.rescan",
          arguments: [table]
        };
      } catch {
        lens.command = {
          title: `\u27F3 Lineage (rescan to update)`,
          command: "lineage.rescan",
          arguments: []
        };
      }
    }
    return lenses;
  }
  refresh() {
    this._onDidChange.fire();
  }
  dispose() {
    this._onDidChange.dispose();
  }
};

// src/sql-decorations.ts
var vscode2 = __toESM(require("vscode"));
var DECO_TYPE = vscode2.window.createTextEditorDecorationType({
  after: {
    color: new vscode2.ThemeColor("editorCodeLens.foreground"),
    fontStyle: "italic",
    margin: "0 0 0 2em"
  },
  rangeBehavior: vscode2.DecorationRangeBehavior.ClosedClosed
});
var COL_RE = /^\s{1,}(\w+)\s+\w/gm;
var SKIP_KEYWORDS = /* @__PURE__ */ new Set([
  "PRIMARY",
  "FOREIGN",
  "UNIQUE",
  "INDEX",
  "KEY",
  "CONSTRAINT",
  "CHECK",
  "CREATE",
  "NOT"
]);
function extractColumns(body) {
  const cols = [];
  COL_RE.lastIndex = 0;
  let m;
  while ((m = COL_RE.exec(body)) !== null) {
    const name = m[1];
    if (!SKIP_KEYWORDS.has(name.toUpperCase()))
      cols.push(name);
  }
  return cols;
}
var SqlDecorationProvider = class {
  constructor(client) {
    this.client = client;
    this.disposables = [];
    this.disposables.push(
      vscode2.window.onDidChangeActiveTextEditor((e) => {
        if (e?.document.languageId === "sql")
          this.decorate(e);
      }),
      vscode2.workspace.onDidSaveTextDocument((doc) => {
        const e = vscode2.window.activeTextEditor;
        if (e && e.document === doc && doc.languageId === "sql")
          this.decorate(e);
      })
    );
    const active = vscode2.window.activeTextEditor;
    if (active?.document.languageId === "sql")
      this.decorate(active);
  }
  async decorate(editor) {
    const text = editor.document.getText();
    const decos = [];
    const tableBlockRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\(([\s\S]*?)\);/gi;
    let tableMatch;
    while ((tableMatch = tableBlockRe.exec(text)) !== null) {
      const tableName = tableMatch[1];
      const body = tableMatch[2];
      const bodyStart = tableMatch.index + tableMatch[0].indexOf("(") + 1;
      let consumerCount = 0;
      try {
        const result = await this.client.listLineage(tableName);
        consumerCount = result.consumers?.length ?? 0;
      } catch {
        continue;
      }
      if (consumerCount === 0)
        continue;
      const cols = extractColumns(body);
      for (const col of cols) {
        const colRe = new RegExp(`\\b${col}\\b`, "i");
        const colIdx = bodyStart + body.search(colRe);
        if (colIdx < bodyStart)
          continue;
        const colPos = editor.document.positionAt(colIdx);
        const lineEnd = editor.document.lineAt(colPos.line).range.end;
        decos.push({
          range: new vscode2.Range(lineEnd, lineEnd),
          renderOptions: {
            after: {
              contentText: `\u2190 ${consumerCount} file${consumerCount !== 1 ? "s" : ""} use ${tableName}`
            }
          }
        });
      }
    }
    editor.setDecorations(DECO_TYPE, decos);
  }
  dispose() {
    DECO_TYPE.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
};

// src/impact-panel.ts
var vscode3 = __toESM(require("vscode"));
function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function confBadge(conf) {
  const cls = conf.toLowerCase();
  return `<span class="badge ${cls}">${conf}</span>`;
}
function lineageHtml(data) {
  const title = data.asset.column ? `${data.asset.table}.${data.asset.column}` : data.asset.table;
  const consumersRows = (data.consumers ?? []).map(
    (c) => `<tr>
          <td><code>${esc(c.filePath)}:${c.line}</code></td>
          <td><code>${esc(c.pattern)}</code></td>
          <td>${esc(c.provenance ?? "unknown")}</td>
          <td>${confBadge(c.confidence)}</td>
        </tr>`
  ).join("");
  const upstreamRows = (data.upstream ?? []).map(
    (u) => `<tr><td><strong>${esc(u.name)}</strong></td><td><code>${esc(u.filePath)}:${u.line}</code></td></tr>`
  ).join("");
  return `
    <h2>\u{1F517} Lineage: <code>${esc(title)}</code></h2>
    <pre class="tree">${esc(data.tree ?? "")}</pre>

    ${data.consumers?.length ? `<h3>Consumers (${data.consumers.length})</h3>
           <table>
             <thead><tr><th>File</th><th>Pattern</th><th>Source</th><th>Confidence</th></tr></thead>
             <tbody>${consumersRows}</tbody>
           </table>` : '<p class="muted">No consumers found for this asset.</p>'}

    ${data.upstream?.length ? `<h3>Upstream Tables</h3>
           <table>
             <thead><tr><th>Table</th><th>Defined at</th></tr></thead>
             <tbody>${upstreamRows}</tbody>
           </table>` : ""}
  `;
}
function impactHtml(data) {
  const asset = data.changedAsset;
  const title = asset.column ? `${asset.table}.${asset.column}` : asset.table;
  const rows = (data.affectedFiles ?? []).map(
    (f) => `
        <tr>
          <td><code>${esc(f.filePath)}:${f.line}</code></td>
          <td>${confBadge(f.confidence)}</td>
          <td>${esc(f.provenance ?? "unknown")}</td>
          <td class="snippet">${f.snippet ? `<pre>${esc(f.snippet)}</pre>` : "\u2014"}</td>
          <td>${f.suggestedFix ? `<em>${esc(f.suggestedFix)}</em>` : "\u2014"}</td>
        </tr>`
  ).join("");
  return `
    <h2>\u26A0 Impact Report: <code>${esc(title)}</code></h2>
    <p><strong>Change:</strong> ${esc(asset.changeType)}${asset.newName ? ` \u2192 <code>${esc(asset.newName)}</code>` : ""}</p>
    <p class="summary">${esc(data.summary)}</p>

    ${data.affectedFiles?.length ? `<table>
             <thead><tr><th>File</th><th>Confidence</th><th>Source</th><th>Snippet</th><th>Fix</th></tr></thead>
             <tbody>${rows}</tbody>
           </table>` : '<p class="muted">No files affected.</p>'}
  `;
}
var PANEL_CSS = `
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
var ImpactPanel = class _ImpactPanel {
  constructor(panel) {
    this.panel = panel;
    panel.onDidDispose(() => {
      _ImpactPanel.current = void 0;
    });
    this.show("<h2>\u27F3 Loading\u2026</h2>");
  }
  static createOrShow(extensionUri) {
    if (_ImpactPanel.current) {
      _ImpactPanel.current.panel.reveal(vscode3.ViewColumn.Beside);
      return _ImpactPanel.current;
    }
    const panel = vscode3.window.createWebviewPanel(
      "lineageImpact",
      "Lineage",
      vscode3.ViewColumn.Beside,
      { enableScripts: false, retainContextWhenHidden: true }
    );
    _ImpactPanel.current = new _ImpactPanel(panel);
    return _ImpactPanel.current;
  }
  showLineage(data) {
    this.panel.title = `Lineage \u2014 ${data.asset.column ? `${data.asset.table}.${data.asset.column}` : data.asset.table}`;
    this.show(lineageHtml(data));
  }
  showImpact(data) {
    const asset = data.changedAsset;
    this.panel.title = `Impact \u2014 ${asset.column ? `${asset.table}.${asset.column}` : asset.table}`;
    this.show(impactHtml(data));
  }
  show(body) {
    this.panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><style>${PANEL_CSS}</style></head>
<body>${body}</body>
</html>`;
  }
};

// src/debug-log.ts
var vscode4 = __toESM(require("vscode"));
var DebugLog = class {
  constructor(output, rootDir, extensionVersion) {
    this.output = output;
    this.rootDir = rootDir;
    this.extensionVersion = extensionVersion;
    this.entries = [];
  }
  info(message) {
    this.write("INFO", message);
  }
  error(message) {
    this.write("ERROR", message);
  }
  async export() {
    const defaultUri = vscode4.Uri.file(`${this.rootDir}/lineage-debug-log.txt`);
    const target = await vscode4.window.showSaveDialog({
      defaultUri,
      filters: { Text: ["txt", "log"] },
      saveLabel: "Export Lineage Debug Log"
    });
    if (!target)
      return void 0;
    const content = this.render();
    await vscode4.workspace.fs.writeFile(target, Buffer.from(content, "utf-8"));
    return target;
  }
  write(level, message) {
    const line = `[${(/* @__PURE__ */ new Date()).toISOString()}] ${level} ${message}`;
    this.entries.push(line);
    this.output.appendLine(line);
  }
  render() {
    return [
      "# Lineage MCP Debug Log",
      "",
      `generatedAt=${(/* @__PURE__ */ new Date()).toISOString()}`,
      `rootDir=${this.rootDir}`,
      `extensionVersion=${this.extensionVersion}`,
      "",
      "## Entries",
      ...this.entries,
      ""
    ].join("\n");
  }
};

// src/extension.ts
function tablesInSql(text) {
  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/gi;
  const names = /* @__PURE__ */ new Set();
  let m;
  while ((m = re.exec(text)) !== null)
    names.add(m[1].toLowerCase());
  return [...names];
}
function activate(context) {
  const output = vscode5.window.createOutputChannel("Lineage MCP");
  context.subscriptions.push(output);
  const rootDir = (vscode5.workspace.getConfiguration("lineage").get("rootDir") || "").trim() || vscode5.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
  const debugLog = new DebugLog(output, rootDir, context.extension.packageJSON.version ?? "unknown");
  debugLog.info(`Activating Lineage MCP with rootDir=${rootDir}`);
  if (context.extensionMode === vscode5.ExtensionMode.Development) {
    void vscode5.window.showInformationMessage(`Lineage MCP activated for ${rootDir}`);
  }
  const client = new LineageClient(rootDir, debugLog);
  context.subscriptions.push({ dispose: () => client.dispose() });
  const codeLens = new SqlCodeLensProvider(client);
  context.subscriptions.push(
    vscode5.languages.registerCodeLensProvider({ language: "sql" }, codeLens),
    codeLens
  );
  const decorations = new SqlDecorationProvider(client);
  context.subscriptions.push(decorations);
  context.subscriptions.push(
    vscode5.commands.registerCommand("lineage.rescan", async () => {
      await vscode5.window.withProgress(
        { location: vscode5.ProgressLocation.Notification, title: "Lineage: scanning\u2026" },
        async () => {
          try {
            const { tables, deps } = await client.scan();
            debugLog.info(`Scan complete tables=${tables} dependencies=${deps}`);
            vscode5.window.showInformationMessage(
              `Lineage: scan complete \u2014 ${tables} tables, ${deps} dependencies`
            );
            codeLens.refresh();
          } catch (err) {
            debugLog.error(`Scan failed: ${err.stack ?? err.message}`);
            vscode5.window.showErrorMessage(`Lineage scan failed: ${err.message}`);
          }
        }
      );
    }),
    vscode5.commands.registerCommand("lineage.showLineage", async (table) => {
      if (!table) {
        try {
          const tables = await client.listTables();
          table = await vscode5.window.showQuickPick(tables, {
            placeHolder: "Select a table to inspect"
          });
        } catch {
          table = await vscode5.window.showInputBox({ prompt: "Enter table name" });
        }
      }
      if (!table)
        return;
      const panel = ImpactPanel.createOrShow(context.extensionUri);
      try {
        const result = await client.listLineage(table);
        debugLog.info(`Loaded lineage table=${table} consumers=${result.consumers?.length ?? 0}`);
        panel.showLineage(result);
      } catch (err) {
        debugLog.error(`Show lineage failed: ${err.stack ?? err.message}`);
        vscode5.window.showErrorMessage(`Lineage error: ${err.message}`);
      }
    }),
    vscode5.commands.registerCommand("lineage.checkImpact", async () => {
      const editor = vscode5.window.activeTextEditor;
      const tables = editor?.document.languageId === "sql" ? tablesInSql(editor.document.getText()) : [];
      const table = tables.length === 1 ? tables[0] : await vscode5.window.showInputBox({ prompt: "Table name", value: tables[0] ?? "" });
      if (!table)
        return;
      const column = await vscode5.window.showInputBox({ prompt: "Column name (leave blank for whole table)" });
      const changeType = await vscode5.window.showQuickPick(
        ["rename", "delete", "type_change", "add"],
        { placeHolder: "Change type" }
      );
      if (!changeType)
        return;
      let newName;
      if (changeType === "rename") {
        newName = await vscode5.window.showInputBox({ prompt: "New name" });
      }
      const panel = ImpactPanel.createOrShow(context.extensionUri);
      try {
        const result = await client.checkImpact(table, changeType, column || void 0, newName);
        debugLog.info(
          `Impact check for table=${table} column=${column ?? ""} changeType=${changeType} results=${result.affectedFiles.length}`
        );
        panel.showImpact(result);
      } catch (err) {
        debugLog.error(`Check impact failed: ${err.stack ?? err.message}`);
        vscode5.window.showErrorMessage(`Lineage error: ${err.message}`);
      }
    }),
    vscode5.commands.registerCommand("lineage.exportDebugLog", async () => {
      try {
        const uri = await debugLog.export();
        if (!uri)
          return;
        debugLog.info(`Exported debug log to ${uri.fsPath}`);
        vscode5.window.showInformationMessage(`Lineage: debug log exported to ${uri.fsPath}`);
      } catch (err) {
        debugLog.error(`Debug log export failed: ${err.stack ?? err.message}`);
        vscode5.window.showErrorMessage(`Lineage debug log export failed: ${err.message}`);
      }
    })
  );
  const autoScan = vscode5.workspace.getConfiguration("lineage").get("autoScanOnSave", true);
  if (autoScan) {
    context.subscriptions.push(
      vscode5.workspace.onDidSaveTextDocument(async (doc) => {
        if (doc.languageId !== "sql")
          return;
        const tables = tablesInSql(doc.getText());
        if (tables.length === 0)
          return;
        for (const table of tables) {
          try {
            const result = await client.listLineage(table);
            const n = result.consumers?.length ?? 0;
            if (n > 0) {
              const action = await vscode5.window.showWarningMessage(
                `\u26A0 Lineage: \`${table}\` has ${n} dependent file${n !== 1 ? "s" : ""}.`,
                "View Lineage",
                "Check Impact",
                "Dismiss"
              );
              if (action === "View Lineage") {
                vscode5.commands.executeCommand("lineage.showLineage", table);
              } else if (action === "Check Impact") {
                vscode5.commands.executeCommand("lineage.checkImpact");
              }
              break;
            }
          } catch {
          }
        }
        codeLens.refresh();
      })
    );
  }
}
function deactivate() {
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
//# sourceMappingURL=extension.js.map
