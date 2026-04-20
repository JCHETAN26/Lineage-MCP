import { readdir, readFile } from "fs/promises";
import { join, extname, resolve } from "path";
import { createGraph, mergeGraph } from "./graph.js";
import { loadDbtManifest } from "./dbt-manifest.js";
import { scanSqlFile } from "./scanners/sql-scanner.js";
import { scanPythonFile } from "./scanners/python-scanner.js";
import { scanTsFile } from "./scanners/ts-scanner.js";
import { scanMlFile } from "./scanners/ml-scanner.js";
import { scanPrismaSchema } from "./scanners/prisma-scanner.js";
const DEFAULT_IGNORE = new Set([
    "node_modules", ".git", "dist", "build", ".lineage", "__pycache__",
    ".venv", "venv", ".tox", "coverage", ".nyc_output", ".pytest_cache",
    "site-packages", "eggs", ".eggs",
]);
// Python files get both general and ML scanning
const EXT_LANG = {
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
export async function crawl(options) {
    const rootDir = resolve(options.rootDir);
    const graph = createGraph();
    const manifest = await loadDbtManifest(rootDir);
    mergeGraph(graph, manifest.graph);
    graph.warnings.push(...manifest.warnings.filter((warning) => !graph.warnings.includes(warning)));
    const files = await collectFiles(rootDir, options.ignore);
    const filtered = files.filter((f) => (EXT_LANG[extname(f).toLowerCase()] || extname(f).toLowerCase() === ".ipynb") &&
        !manifest.managedFiles.has(f));
    // Process in batches to avoid memory pressure
    const BATCH_SIZE = 200;
    for (let i = 0; i < filtered.length; i += BATCH_SIZE) {
        const batch = filtered.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(batch.map((f) => scanFile(f)));
        for (const result of results) {
            if (result)
                mergeGraph(graph, result);
        }
    }
    return graph;
}
async function scanFile(filePath) {
    const ext = extname(filePath).toLowerCase();
    const lang = EXT_LANG[ext];
    const isNotebook = ext === ".ipynb";
    if (!lang && !isNotebook)
        return null;
    try {
        let content = await readFile(filePath, "utf-8");
        // Extract source cells from Jupyter notebooks
        if (isNotebook) {
            content = extractNotebookSource(content);
        }
        const partial = createGraph();
        if (lang === "sql") {
            const { tables, dependencies } = scanSqlFile(content, filePath);
            for (const t of tables)
                partial.tables.set(t.name, t);
            partial.dependencies.push(...dependencies);
        }
        else if (lang === "python" || isNotebook) {
            partial.dependencies.push(...scanPythonFile(content, filePath));
            partial.dependencies.push(...scanMlFile(content, filePath));
        }
        else if (lang === "ts") {
            partial.dependencies.push(...scanTsFile(content, filePath));
        }
        else if (lang === "prisma") {
            for (const table of scanPrismaSchema(content, filePath)) {
                partial.tables.set(table.name, table);
            }
        }
        return partial;
    }
    catch {
        return null;
    }
}
function extractNotebookSource(raw) {
    try {
        const nb = JSON.parse(raw);
        return (nb.cells ?? [])
            .filter((c) => c.cell_type === "code")
            .map((c) => (Array.isArray(c.source) ? c.source.join("") : c.source))
            .join("\n");
    }
    catch {
        return "";
    }
}
async function collectFiles(dir, ignore) {
    const ignoreDirs = new Set([...DEFAULT_IGNORE, ...(ignore ?? [])]);
    const files = [];
    async function walk(current) {
        let entries;
        try {
            entries = await readdir(current, { withFileTypes: true });
        }
        catch {
            return;
        }
        await Promise.all(entries.map(async (entry) => {
            if (ignoreDirs.has(entry.name))
                return;
            const full = join(current, entry.name);
            if (entry.isDirectory()) {
                await walk(full);
            }
            else if (entry.isFile()) {
                files.push(full);
            }
        }));
    }
    await walk(dir);
    return files;
}
//# sourceMappingURL=crawler.js.map