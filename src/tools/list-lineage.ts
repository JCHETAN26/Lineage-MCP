import { z } from "zod";
import type { LineageGraph, LineageResult } from "../types.js";
import {
  getDependenciesForTable,
  getDependenciesForColumn,
  buildLineageTree,
  getTableNames,
} from "../graph.js";

export const ListLineageSchema = z.object({
  table: z.string().describe("Table name to inspect"),
  column: z.string().optional().describe("Optional column name to narrow the lineage"),
  rootDir: z.string().default(".").describe("Root directory to scan"),
});

export type ListLineageInput = z.infer<typeof ListLineageSchema>;

export function listLineage(input: ListLineageInput, graph: LineageGraph): LineageResult {
  const { table, column } = input;

  const consumers = column
    ? getDependenciesForColumn(graph, table, column)
    : getDependenciesForTable(graph, table);

  // upstream = other tables that feed the same consumers (heuristic: same file)
  const consumerFiles = new Set(consumers.map((c) => c.filePath));
  const allDeps = graph.dependencies;
  const upstreamTableNames = new Set<string>();
  for (const dep of allDeps) {
    if (consumerFiles.has(dep.filePath) && dep.referencedTable !== table) {
      upstreamTableNames.add(dep.referencedTable);
    }
  }

  const upstream = Array.from(upstreamTableNames)
    .map((n) => graph.tables.get(n))
    .filter((t): t is NonNullable<typeof t> => t !== undefined);

  const tree = buildLineageTree(graph, table, column);

  return {
    asset: { table, column },
    consumers,
    upstream,
    tree,
    warnings: graph.warnings,
  };
}

export function listAllTables(graph: LineageGraph): string[] {
  return getTableNames(graph);
}
