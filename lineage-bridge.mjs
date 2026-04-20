#!/usr/bin/env node
// JSON-lines RPC bridge used by the VS Code extension.
// Reads one JSON request per line from stdin, writes one JSON response per line to stdout.

import { crawl } from './dist/crawler.js';
import { checkImpact as _checkImpact } from './dist/tools/check-impact.js';
import { listLineage as _listLineage, listAllTables } from './dist/tools/list-lineage.js';
import { saveGraph, loadGraph } from './dist/cache.js';

const CACHE_TTL = 5 * 60 * 1000;
const graphCache = new Map(); // rootDir → LineageGraph (in-process cache for this bridge process)

async function getGraph(rootDir) {
  if (graphCache.has(rootDir)) return graphCache.get(rootDir);
  const persisted = loadGraph(rootDir, CACHE_TTL);
  if (persisted) { graphCache.set(rootDir, persisted); return persisted; }
  const graph = await crawl({ rootDir });
  saveGraph(rootDir, graph);
  graphCache.set(rootDir, graph);
  return graph;
}

process.stdin.setEncoding('utf-8');
let buf = '';

process.stdin.on('data', (chunk) => {
  buf += chunk;
  const lines = buf.split('\n');
  buf = lines.pop() ?? '';
  for (const line of lines) {
    if (line.trim()) handleRequest(JSON.parse(line)).catch((err) => {
      process.stderr.write(`[bridge error] ${err.message}\n`);
    });
  }
});

async function handleRequest({ id, method, params }) {
  try {
    const rootDir = params?.rootDir ?? process.cwd();
    let result;

    if (method === 'scan') {
      graphCache.delete(rootDir);
      const graph = await crawl({ rootDir });
      saveGraph(rootDir, graph);
      graphCache.set(rootDir, graph);
      result = { tables: graph.tables.size, deps: graph.dependencies.length };

    } else if (method === 'check_impact') {
      const graph = await getGraph(rootDir);
      result = await _checkImpact(params, graph);

    } else if (method === 'list_lineage') {
      const graph = await getGraph(rootDir);
      result = _listLineage(params, graph);

    } else if (method === 'list_tables') {
      const graph = await getGraph(rootDir);
      result = listAllTables(graph);

    } else {
      throw new Error(`Unknown method: ${method}`);
    }

    respond(id, result, null);
  } catch (err) {
    respond(id, null, err.message ?? String(err));
  }
}

function respond(id, result, error) {
  process.stdout.write(JSON.stringify(error ? { id, error } : { id, result }) + '\n');
}
