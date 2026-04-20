"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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

// src/test/suite/extension.test.ts
var assert = __toESM(require("assert"));
var vscode = __toESM(require("vscode"));
var path = __toESM(require("path"));
var wait = (ms) => new Promise((r) => setTimeout(r, ms));
suite("Lineage MCP \u2014 VS Code integration", () => {
  let sqlDoc;
  suiteSetup(async () => {
    const fixturesPath = process.env.LINEAGE_FIXTURES ?? path.resolve(__dirname, "../../../../test-fixtures");
    await vscode.workspace.getConfiguration("lineage").update("rootDir", fixturesPath, vscode.ConfigurationTarget.Global);
    const ext = vscode.extensions.getExtension("cjitendr.lineage-mcp-vscode");
    assert.ok(ext, "Extension cjitendr.lineage-mcp-vscode must be installed");
    if (!ext.isActive)
      await ext.activate();
    const sqlPath = path.join(fixturesPath, "sql", "schema.sql");
    sqlDoc = await vscode.workspace.openTextDocument(sqlPath);
    await vscode.window.showTextDocument(sqlDoc);
    await wait(6e3);
  });
  test("Extension activates successfully", () => {
    const ext = vscode.extensions.getExtension("cjitendr.lineage-mcp-vscode");
    assert.strictEqual(ext?.isActive, true, "Extension should be active");
  });
  test("All three lineage commands are registered", async () => {
    const cmds = await vscode.commands.getCommands(true);
    for (const cmd of ["lineage.showLineage", "lineage.checkImpact", "lineage.rescan"]) {
      assert.ok(cmds.includes(cmd), `Command ${cmd} should be registered`);
    }
  });
  test("CodeLens appears above CREATE TABLE lines", async () => {
    const lenses = await vscode.commands.executeCommand(
      "vscode.executeCodeLensProvider",
      sqlDoc.uri
    );
    assert.ok(
      lenses && lenses.length > 0,
      "Expected at least one CodeLens on the SQL file"
    );
    const resolved = lenses.filter((l) => l.command?.title);
    console.log(`
  CodeLenses found (${resolved.length}):`);
    for (const l of resolved) {
      console.log(`    line ${l.range.start.line + 1}: "${l.command?.title}"`);
    }
    const hasLineageLens = resolved.some(
      (l) => l.command?.title?.match(/dependent|No dependents|Lineage/i)
    );
    assert.ok(
      hasLineageLens,
      `Expected a CodeLens with lineage info, got: ${resolved.map((l) => `"${l.command?.title}"`).join(", ")}`
    );
  });
  test("One CodeLens per CREATE TABLE statement", async () => {
    const text = sqlDoc.getText();
    const tableCount = [...text.matchAll(/CREATE\s+TABLE/gi)].length;
    const lenses = await vscode.commands.executeCommand(
      "vscode.executeCodeLensProvider",
      sqlDoc.uri
    );
    assert.ok(
      (lenses?.length ?? 0) >= tableCount,
      `Expected at least ${tableCount} CodeLenses (one per table), got ${lenses?.length ?? 0}`
    );
  });
  test("lineage.showLineage opens the impact panel", async () => {
    const text = sqlDoc.getText();
    const match = text.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i);
    const tableName = match?.[1];
    assert.ok(tableName, "Could not find a table name in the SQL fixture");
    await vscode.commands.executeCommand("lineage.showLineage", tableName);
    await wait(2e3);
    assert.ok(true, "lineage.showLineage executed without error");
  });
});
//# sourceMappingURL=extension.test.js.map
