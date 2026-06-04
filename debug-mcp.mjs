#!/usr/bin/env node

/**
 * Lineage-MCP Debug Wrapper
 * Helps diagnose MCP server issues
 */

import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = `${__dirname}/dist/index.js`;

console.error(`[DEBUG] Starting Lineage-MCP server...`);
console.error(`[DEBUG] Server path: ${serverPath}`);

const server = spawn("node", [serverPath], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, DEBUG: "1" }
});

let buffer = "";

server.stdout.on("data", (data) => {
  buffer += data.toString();
  console.error(`[STDOUT] ${data.toString().trim()}`);
});

server.stderr.on("data", (data) => {
  console.error(`[STDERR] ${data.toString().trim()}`);
});

server.on("error", (err) => {
  console.error(`[ERROR] Server spawn error:`, err);
  process.exit(1);
});

server.on("close", (code) => {
  console.error(`[DEBUG] Server closed with code ${code}`);
  process.exit(code || 0);
});

// Wait a bit then send a test message
setTimeout(() => {
  console.error(`[DEBUG] Sending test initialize message...`);
  const testMsg = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test-client", version: "1.0" }
    }
  });
  server.stdin.write(testMsg + "\n");
}, 500);
