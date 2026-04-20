import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "fs";
import { join } from "path";
import type { LineageGraph, TableNode, DependencyNode } from "./types.js";
import { createGraph } from "./graph.js";

interface CacheFile {
  version: number;
  scannedAt: number;
  manifestPath?: string;
  manifestMtimeMs?: number;
  tables: Array<[string, TableNode]>;
  dependencies: DependencyNode[];
}

const CACHE_VERSION = 1;

function cacheDir(rootDir: string): string {
  return join(rootDir, ".lineage");
}

function cachePath(rootDir: string): string {
  return join(cacheDir(rootDir), "cache.json");
}

export function saveGraph(rootDir: string, graph: LineageGraph): void {
  try {
    const dir = cacheDir(rootDir);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const payload: CacheFile = {
      version: CACHE_VERSION,
      scannedAt: Date.now(),
      ...getManifestState(rootDir),
      tables: Array.from(graph.tables.entries()),
      dependencies: graph.dependencies,
    };

    writeFileSync(cachePath(rootDir), JSON.stringify(payload), "utf-8");
  } catch {
    // cache write failure is non-fatal
  }
}

export function loadGraph(rootDir: string, maxAgeMs: number): LineageGraph | null {
  try {
    const path = cachePath(rootDir);
    if (!existsSync(path)) return null;

    const raw = readFileSync(path, "utf-8");
    const payload: CacheFile = JSON.parse(raw);

    if (payload.version !== CACHE_VERSION) return null;
    if (Date.now() - payload.scannedAt > maxAgeMs) return null;
    if (hasManifestChanged(rootDir, payload)) return null;

    const graph = createGraph();
    for (const [name, table] of payload.tables) {
      graph.tables.set(name, table);
    }
    graph.dependencies.push(...payload.dependencies);
    return graph;
  } catch {
    return null;
  }
}

function getManifestState(rootDir: string): Pick<CacheFile, "manifestPath" | "manifestMtimeMs"> {
  for (const relative of ["target/manifest.json", "manifest.json"]) {
    const fullPath = join(rootDir, relative);
    if (!existsSync(fullPath)) continue;
    try {
      return {
        manifestPath: relative,
        manifestMtimeMs: statSync(fullPath).mtimeMs,
      };
    } catch {
      return {
        manifestPath: relative,
      };
    }
  }

  return {};
}

function hasManifestChanged(rootDir: string, payload: CacheFile): boolean {
  const current = getManifestState(rootDir);
  if (payload.manifestPath !== current.manifestPath) return true;
  if ((payload.manifestMtimeMs ?? null) !== (current.manifestMtimeMs ?? null)) return true;
  return false;
}
