import type { LineageGraph, TableNode, DependencyNode } from "./types.js";

export function createGraph(): LineageGraph {
  return {
    tables: new Map(),
    dependencies: [],
    warnings: [],
  };
}

export function mergeGraph(target: LineageGraph, source: LineageGraph): void {
  for (const [name, table] of source.tables) {
    target.tables.set(name, table);
  }
  for (const dep of source.dependencies) {
    if (!hasDuplicate(target.dependencies, dep)) {
      target.dependencies.push(dep);
    }
  }
  for (const warning of source.warnings) {
    if (!target.warnings.includes(warning)) {
      target.warnings.push(warning);
    }
  }
}

function hasDuplicate(deps: DependencyNode[], candidate: DependencyNode): boolean {
  return deps.some(
    (d) =>
      d.filePath === candidate.filePath &&
      d.line === candidate.line &&
      d.referencedTable === candidate.referencedTable &&
      d.referencedColumn === candidate.referencedColumn
  );
}

export function getTableNames(graph: LineageGraph): string[] {
  return Array.from(graph.tables.keys());
}

export function getDependenciesForTable(
  graph: LineageGraph,
  tableName: string
): DependencyNode[] {
  const lower = tableName.toLowerCase();
  return graph.dependencies.filter((d) => d.referencedTable.toLowerCase() === lower);
}

export function getDependenciesForColumn(
  graph: LineageGraph,
  tableName: string,
  columnName: string
): DependencyNode[] {
  const tLower = tableName.toLowerCase();
  const cLower = columnName.toLowerCase();
  return graph.dependencies.filter(
    (d) =>
      d.referencedTable.toLowerCase() === tLower &&
      d.referencedColumn?.toLowerCase() === cLower
  );
}

export function buildLineageTree(
  graph: LineageGraph,
  tableName: string,
  columnName?: string
): string {
  const table = graph.tables.get(tableName) ?? graph.tables.get(tableName.toLowerCase());
  const deps = columnName
    ? getDependenciesForColumn(graph, tableName, columnName)
    : getDependenciesForTable(graph, tableName);

  const assetLabel = columnName ? `${tableName}.${columnName}` : tableName;
  const lines: string[] = [`${assetLabel}`];

  if (table) {
    lines.push(`  defined in: ${table.filePath}:${table.line}`);
    if (!columnName) {
      lines.push(`  columns: ${table.columns.map((c) => c.name).join(", ")}`);
    }
  }

  if (deps.length === 0) {
    lines.push("  (no dependents found)");
  } else {
    lines.push(`  consumers (${deps.length}):`);
    for (const dep of deps) {
      lines.push(`    ├─ ${dep.filePath}:${dep.line} [${dep.confidence}] — ${dep.pattern}`);
    }
  }

  return lines.join("\n");
}
