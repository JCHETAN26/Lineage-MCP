import { z } from "zod";
import { readFile } from "fs/promises";
import type { LineageGraph, ImpactReport, AffectedFile } from "../types.js";
import { getDependenciesForTable, getDependenciesForColumn } from "../graph.js";

export const CheckImpactSchema = z.object({
  table: z.string().describe("Table name that is changing"),
  column: z.string().optional().describe("Column name (if a column is changing)"),
  changeType: z
    .enum(["rename", "delete", "type_change", "add"])
    .describe("Type of schema change"),
  newName: z.string().optional().describe("New name (for renames)"),
  rootDir: z.string().default(".").describe("Root directory to scan"),
});

export type CheckImpactInput = z.infer<typeof CheckImpactSchema>;

export async function checkImpact(
  input: CheckImpactInput,
  graph: LineageGraph
): Promise<ImpactReport> {
  const { table, column, changeType, newName } = input;

  // For column-level impact: get all files that reference the table,
  // then filter/score by whether they also mention the column name.
  const tableDeps = getDependenciesForTable(graph, table);
  const columnDeps = column ? getDependenciesForColumn(graph, table, column) : [];

  // Candidates = explicit column deps union table deps (table deps may reference the column in SQL strings)
  const candidates = column ? tableDeps : tableDeps;

  const rawResults = await Promise.all(
    candidates.map(async (dep): Promise<AffectedFile | null> => {
      let content = "";
      let snippet: string | undefined;
      try {
        content = await readFile(dep.filePath, "utf-8");
        const lines = content.split("\n");
        snippet = lines.slice(Math.max(0, dep.line - 2), dep.line + 1).join("\n").trim();
      } catch {
        // unreadable — skip
      }

      // For column impact: only include files that actually mention the column name
      if (column) {
        if (!columnMatchForDependency(content, dep, table, column)) return null;
      }

      // Boost confidence if explicit column dep; keep dep confidence otherwise
      const isExplicitColDep = columnDeps.some(
        (c) => c.filePath === dep.filePath && c.line === dep.line
      );
      const confidence: "high" | "medium" | "low" = isExplicitColDep
        ? "high"
        : column
        ? "medium"
        : dep.confidence;

      return {
        filePath: dep.filePath,
        line: dep.line,
        snippet,
        confidence,
        provenance: dep.provenance,
        evidenceType: dep.evidenceType,
        suggestedFix: buildFix(changeType, column ?? table, newName, dep.pattern),
      };
    })
  );
  const affectedFiles: AffectedFile[] = rawResults.filter(
    (f): f is AffectedFile => f !== null
  );

  const assetLabel = column ? `${table}.${column}` : table;
  const summary =
    affectedFiles.length === 0
      ? `No dependents found for ${assetLabel}. Safe to ${changeType}.`
      : `Found ${affectedFiles.length} file(s) referencing ${assetLabel}. Review before applying ${changeType}.`;

  return {
    changedAsset: { table, column, changeType, newName },
    affectedFiles,
    summary,
    warnings: graph.warnings,
  };
}

function columnMatchForDependency(
  content: string,
  dep: LineageGraph["dependencies"][number],
  table: string,
  column: string
): boolean {
  const colRe = new RegExp(`\\b${escapeRegExp(column)}\\b`, "i");

  if (dep.language !== "sql") {
    return colRe.test(content);
  }

  const statement = findSqlStatementForLine(content, dep.line);
  if (!statement) return false;

  if (!colRe.test(statement)) return false;

  const tableAliases = extractSqlAliases(statement, table);
  if (tableAliases.length === 0) {
    return colRe.test(statement);
  }

  const aliasQualified = tableAliases.some((alias) =>
    new RegExp(`\\b${escapeRegExp(alias)}\\s*\\.\\s*${escapeRegExp(column)}\\b`, "i").test(statement)
  );
  if (aliasQualified) return true;

  // If the statement directly references the table but not via alias, allow bare column usage.
  const directTableReference = new RegExp(`\\b${escapeRegExp(table)}\\b`, "i").test(statement);
  return directTableReference && colRe.test(statement);
}

function findSqlStatementForLine(content: string, line: number): string {
  const lines = content.split("\n");
  const startLine = Math.max(0, line - 1);
  let start = startLine;
  let end = startLine;

  while (start > 0 && !lines[start - 1].includes(";")) start--;
  while (end < lines.length - 1 && !lines[end].includes(";")) end++;

  return lines.slice(start, end + 1).join("\n");
}

function extractSqlAliases(statement: string, table: string): string[] {
  const aliases = new Set<string>();
  const re = new RegExp(
    `\\b(?:FROM|JOIN|UPDATE|INTO)\\s+${escapeRegExp(table)}\\b(?:\\s+(?:AS\\s+)?(\\w+))?`,
    "gi"
  );

  for (const match of statement.matchAll(re)) {
    if (match[1]) aliases.add(match[1]);
  }

  return Array.from(aliases);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildFix(
  changeType: string,
  name: string,
  newName: string | undefined,
  pattern: string
): string {
  if (changeType === "rename" && newName) {
    return `Replace "${name}" with "${newName}"`;
  }
  if (changeType === "delete") {
    return `Remove reference to "${name}"`;
  }
  if (changeType === "type_change") {
    return `Verify type casting around "${name}"`;
  }
  return `Review usage of "${name}" (pattern: ${pattern})`;
}
