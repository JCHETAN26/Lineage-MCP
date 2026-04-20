import { access, readFile, readdir, stat } from "fs/promises";
import { join, resolve } from "path";
import type { LineageGraph, TableNode, DependencyNode, ColumnDef } from "./types.js";
import { createGraph } from "./graph.js";

interface DbtManifest {
  nodes?: Record<string, DbtNode>;
  sources?: Record<string, DbtNode>;
}

interface DbtNode {
  unique_id: string;
  resource_type?: string;
  name?: string;
  original_file_path?: string;
  path?: string;
  depends_on?: { nodes?: string[] };
  columns?: Record<string, { name?: string; data_type?: string; data_type_name?: string }>;
  source_name?: string;
}

export interface DbtManifestResult {
  graph: LineageGraph;
  manifestPath: string | null;
  managedFiles: Set<string>;
  warnings: string[];
}

const CANDIDATE_PATHS = ["target/manifest.json", "manifest.json"];
const SUPPORTED_RESOURCE_TYPES = new Set(["model", "seed", "snapshot"]);

export async function loadDbtManifest(rootDir: string): Promise<DbtManifestResult> {
  const manifestPath = await findManifestPath(rootDir);
  if (!manifestPath) {
    return { graph: createGraph(), manifestPath: null, managedFiles: new Set(), warnings: [] };
  }

  try {
    const raw = await readFile(manifestPath, "utf-8");
    const manifest = JSON.parse(raw) as DbtManifest;
    const warnings = await getManifestWarnings(rootDir, manifestPath);
    return {
      graph: buildGraphFromManifest(rootDir, manifest),
      manifestPath,
      managedFiles: collectManagedFiles(rootDir, manifest),
      warnings,
    };
  } catch {
    return {
      graph: createGraph(),
      manifestPath,
      managedFiles: new Set(),
      warnings: [`Warning: dbt manifest at ${manifestPath} could not be parsed. Falling back to source scanning.`],
    };
  }
}

async function findManifestPath(rootDir: string): Promise<string | null> {
  for (const relative of CANDIDATE_PATHS) {
    const fullPath = join(rootDir, relative);
    try {
      await access(fullPath);
      return fullPath;
    } catch {
      // keep looking
    }
  }
  return null;
}

function buildGraphFromManifest(rootDir: string, manifest: DbtManifest): LineageGraph {
  const graph = createGraph();
  const lookup = new Map<string, DbtNode>();

  for (const node of Object.values(manifest.nodes ?? {})) {
    if (isTrackableNode(node)) {
      lookup.set(node.unique_id, node);
      const table = toTableNode(rootDir, node);
      graph.tables.set(table.name, table);
    }
  }

  for (const source of Object.values(manifest.sources ?? {})) {
    if (source.name && source.unique_id) {
      lookup.set(source.unique_id, source);
      const table = toSourceTableNode(rootDir, source);
      graph.tables.set(table.name, table);
    }
  }

  for (const node of Object.values(manifest.nodes ?? {})) {
    if (!isTrackableNode(node) || !node.name) continue;
    const filePath = resolveManifestPath(rootDir, node);
    for (const dependencyId of node.depends_on?.nodes ?? []) {
      const dependency = lookup.get(dependencyId);
      const dependencyName = dependency?.name;
      if (!dependencyName) continue;
      graph.dependencies.push({
        type: "dependency",
        filePath,
        line: 1,
        pattern: `manifest:${dependencyId}`,
        provenance: "dbt manifest",
        evidenceType: "verified",
        referencedTable: dependencyName,
        confidence: "high",
        language: "sql",
      });
    }
  }

  return graph;
}

function collectManagedFiles(rootDir: string, manifest: DbtManifest): Set<string> {
  const files = new Set<string>();
  for (const node of Object.values(manifest.nodes ?? {})) {
    if (!isTrackableNode(node)) continue;
    files.add(resolveManifestPath(rootDir, node));
  }
  return files;
}

function isTrackableNode(node: DbtNode): boolean {
  return Boolean(node.unique_id && node.name && node.resource_type && SUPPORTED_RESOURCE_TYPES.has(node.resource_type));
}

function toTableNode(rootDir: string, node: DbtNode): TableNode {
  return {
    type: "table",
    name: node.name!,
    columns: extractColumns(node),
    filePath: resolveManifestPath(rootDir, node),
    line: 1,
  };
}

function toSourceTableNode(rootDir: string, node: DbtNode): TableNode {
  return {
    type: "table",
    name: node.name!,
    columns: extractColumns(node),
    filePath: resolveManifestPath(rootDir, node),
    line: 1,
  };
}

function extractColumns(node: DbtNode): ColumnDef[] {
  return Object.entries(node.columns ?? {}).map(([name, value]) => ({
    name: value.name ?? name,
    dataType: value.data_type ?? value.data_type_name,
  }));
}

function resolveManifestPath(rootDir: string, node: DbtNode): string {
  const relative = node.original_file_path ?? node.path ?? "";
  return resolve(rootDir, relative);
}

async function getManifestWarnings(rootDir: string, manifestPath: string): Promise<string[]> {
  try {
    const manifestStat = await stat(manifestPath);
    const sqlFiles = await collectSqlFiles(join(rootDir, "models"));
    for (const file of sqlFiles) {
      const fileStat = await stat(file);
      if (fileStat.mtimeMs > manifestStat.mtimeMs) {
        return [
          "Warning: dbt manifest is stale. Results may be inaccurate. Run 'dbt compile' to refresh.",
        ];
      }
    }
  } catch {
    return [];
  }
  return [];
}

async function collectSqlFiles(
  dir: string
): Promise<string[]> {
  const files: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true, encoding: "utf8" });
  } catch {
    return files;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSqlFiles(fullPath)));
    } else if (entry.isFile() && fullPath.endsWith(".sql")) {
      files.push(fullPath);
    }
  }

  return files;
}
