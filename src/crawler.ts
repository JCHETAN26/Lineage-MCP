import { readdir, readFile } from "fs/promises";
import { join, extname, resolve } from "path";
import type { LineageGraph, ScanOptions } from "./types.js";
import { createGraph, mergeGraph } from "./graph.js";
import { loadDbtManifest } from "./dbt-manifest.js";
import { scanSqlFile } from "./scanners/sql-scanner.js";
import { scanPythonFile } from "./scanners/python-scanner.js";
import { scanSqlAlchemyFile } from "./scanners/sqlalchemy-scanner.js";
import { scanTsFile } from "./scanners/ts-scanner.js";
import { scanMlFile } from "./scanners/ml-scanner.js";
import { scanPrismaSchema } from "./scanners/prisma-scanner.js";

const DEFAULT_IGNORE = new Set([
  "node_modules", ".git", "dist", "build", ".lineage", "__pycache__",
  ".venv", "venv", ".tox", "coverage", ".nyc_output", ".pytest_cache",
  "site-packages", "eggs", ".eggs",
]);

// Python files get both general and ML scanning
const EXT_LANG: Record<string, "sql" | "python" | "ts" | "prisma"> = {
  ".sql": "sql",
  ".py": "python",
  ".ts": "ts",
  ".tsx": "ts",
  ".js": "ts",
  ".jsx": "ts",
  ".mjs": "ts",
  ".cjs": "ts",
  ".prisma": "prisma",
};

const ML_EXTENSIONS = new Set([".py", ".ipynb"]);

export async function crawl(options: ScanOptions): Promise<LineageGraph> {
  const rootDir = resolve(options.rootDir);
  const graph = createGraph();
  const manifest = await loadDbtManifest(rootDir);
  mergeGraph(graph, manifest.graph);
  graph.warnings.push(...manifest.warnings.filter((warning) => !graph.warnings.includes(warning)));

  const files = await collectFiles(rootDir, options.ignore);
  const filtered = files.filter(
    (f) =>
      (EXT_LANG[extname(f).toLowerCase()] || extname(f).toLowerCase() === ".ipynb") &&
      !manifest.managedFiles.has(f)
  );

  // Process in batches to avoid memory pressure
  const BATCH_SIZE = 200;
  for (let i = 0; i < filtered.length; i += BATCH_SIZE) {
    const batch = filtered.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map((f) => scanFile(f)));
    for (const result of results) {
      if (result) mergeGraph(graph, result);
    }
  }

  return graph;
}

async function scanFile(filePath: string): Promise<LineageGraph | null> {
  const ext = extname(filePath).toLowerCase();
  const lang = EXT_LANG[ext];
  const isNotebook = ext === ".ipynb";

  if (!lang && !isNotebook) return null;

  try {
    let content = await readFile(filePath, "utf-8");

    // Extract source cells from Jupyter notebooks
    if (isNotebook) {
      content = extractNotebookSource(content);
    }

    const partial = createGraph();

    if (lang === "sql") {
      const { tables, dependencies } = scanSqlFile(content, filePath);
      for (const t of tables) partial.tables.set(t.name, t);
      partial.dependencies.push(...dependencies);
    } else if (lang === "python" || isNotebook) {
      partial.dependencies.push(...scanPythonFile(content, filePath));
      partial.dependencies.push(...scanMlFile(content, filePath));
      // SQLAlchemy declarative models — registered as tables alongside the
      // dependency-style scans so they show up in list_tables and become
      // anchorable in lineage queries.
      for (const table of scanSqlAlchemyFile(content, filePath)) {
        partial.tables.set(table.name, table);
      }
    } else if (lang === "ts") {
      partial.dependencies.push(...scanTsFile(content, filePath));
    } else if (lang === "prisma") {
      for (const table of scanPrismaSchema(content, filePath)) {
        partial.tables.set(table.name, table);
      }
    }

    return partial;
  } catch {
    return null;
  }
}

/**
 * Extract code cell source from a Jupyter notebook, preserving line alignment
 * with the raw .ipynb file. A reference detected at "line N" of the extracted
 * content will correspond to line N of the underlying .ipynb JSON — landing
 * the user inside the right cell's source array, not on JSON metadata.
 *
 * The alignment is approximate (cell-start granularity is exact; within a
 * cell, escaped newlines mean lines won't match the rendered notebook). But
 * it's a strict improvement over reporting line 1 / metadata lines.
 */
function extractNotebookSource(raw: string): string {
  try {
    const nb = JSON.parse(raw) as {
      cells?: Array<{ cell_type: string; source: string[] | string }>;
    };
    const cells = nb.cells ?? [];

    // For each cell (in document order), find the line in `raw` where its
    // `"source":` key appears. Cells in the parsed object correspond 1:1
    // with `"cell_type"` occurrences in the raw text.
    const rawLines = raw.split("\n");
    const sourceLines: number[] = [];
    let lookingForSource = false;
    for (let i = 0; i < rawLines.length; i++) {
      if (rawLines[i].includes('"cell_type"')) {
        if (lookingForSource) sourceLines.push(i + 1); // previous cell had no source
        lookingForSource = true;
      } else if (lookingForSource && rawLines[i].includes('"source"')) {
        sourceLines.push(i + 2); // +2: 1-indexed, and first source string is on the next line
        lookingForSource = false;
      }
    }
    if (lookingForSource) sourceLines.push(rawLines.length);

    const output: string[] = [];
    let currentLine = 1;
    for (let idx = 0; idx < cells.length; idx++) {
      const cell = cells[idx];
      if (cell.cell_type !== "code") continue;
      const targetLine = sourceLines[idx] ?? currentLine;
      while (currentLine < targetLine) {
        output.push("");
        currentLine++;
      }
      const src = Array.isArray(cell.source) ? cell.source.join("") : cell.source ?? "";
      const srcLines = src.split("\n");
      for (const sl of srcLines) {
        output.push(sl);
        currentLine++;
      }
    }
    return output.join("\n");
  } catch {
    return "";
  }
}

async function collectFiles(dir: string, ignore?: string[]): Promise<string[]> {
  const ignoreDirs = new Set([...DEFAULT_IGNORE, ...(ignore ?? [])]);
  const files: string[] = [];

  async function walk(current: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }

    await Promise.all(
      entries.map(async (entry) => {
        if (ignoreDirs.has(entry.name)) return;
        const full = join(current, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
        } else if (entry.isFile()) {
          files.push(full);
        }
      })
    );
  }

  await walk(dir);
  return files;
}
