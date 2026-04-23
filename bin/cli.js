#!/usr/bin/env node

/**
 * Lineage-MCP CLI Entry Point
 * Supports both MCP server mode and direct CLI usage
 */

import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

// Check if running in MCP mode (stdin-based) or CLI mode
const isMCP = process.argv.includes("--mcp") || !process.stdin.isTTY;

if (isMCP) {
  // Run as MCP server
  const mainScript = resolve(projectRoot, "dist", "index.js");
  exec(`node ${mainScript}`, (error) => {
    if (error) {
      console.error("MCP Server error:", error);
      process.exit(1);
    }
  });
} else {
  // CLI mode - show help or run commands
  const args = process.argv.slice(2);
  showCLIHelp();
}

function showCLIHelp() {
  console.log(`
Lineage-MCP: Data Contract Sentinel
====================================

Usage: lineage-mcp [command] [options]

Commands:
  mcp                   Start as MCP server (for IDE integration)
  help                  Show this help message
  version               Show version information

IDE Integration:
  This tool is designed for Model Context Protocol (MCP) clients:
  - Cursor
  - Claude Desktop
  - VS Code (with MCP extension)

Configuration Example (for Cursor/Claude Desktop):
  {
    "mcpServers": {
      "lineage": {
        "command": "npx",
        "args": ["-y", "@cjitendr/lineage-mcp"]
      }
    }
  }

Available MCP Tools:
  - check_impact        Analyze the blast radius of a schema change
  - list_lineage        Show the full dependency chain for a table/column
  - list_tables         List all discovered tables and assets
  - scan                Trigger a fresh rescan of the codebase
  - apply_remediation   Apply an automated fix to a file
  - audit_pii_compliance Audit for PII exposure
  - sync_dbt_metadata   Synchronize dbt YAML with discovered columns

For more information, visit:
https://github.com/JCHETAN26/Lineage-MCP
  `);
}
