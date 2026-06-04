import { writeFile, mkdir } from "fs/promises";
import { dirname } from "path";
import type { LineageGraph, TableNode, DependencyNode } from "../types.js";

export interface HealthReportOptions {
  outputPath?: string;
  includeDiagram?: boolean;
  includeMetrics?: boolean;
}

export interface HealthReport {
  timestamp: string;
  summary: {
    totalTables: number;
    totalDependencies: number;
    filesScanned: number;
    healthScore: number; // 0-100
  };
  warnings: string[];
  recommendations: string[];
  mermaidDiagram?: string;
}

/**
 * Health score based on graph state. Empty graphs (0 tables) must NOT score
 * 100 — that masks misconfiguration where the scanner found nothing.
 */
function calculateHealthScore(graph: LineageGraph): number {
  const tables = graph.tables.size;
  const deps = graph.dependencies.length;
  const warnings = (graph.warnings || []).length;

  // No tables = the scanner found nothing useful. Capped low so the report
  // surfaces this rather than reading green to the user.
  if (tables === 0) return deps === 0 && warnings === 0 ? 25 : 10;

  let score = 90; // start below 100 so warning-free isn't auto-perfect
  score -= Math.min(warnings * 10, 30);

  if (deps > 0) {
    const avgDepsPerTable = deps / tables;
    if (avgDepsPerTable >= 1) score += 5;
    if (avgDepsPerTable >= 5 && avgDepsPerTable <= 10) score += 5;
  } else {
    // Tables exist but nothing references them — likely a parsing gap.
    score -= 20;
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Generate Mermaid diagram from the lineage graph. Every node gets a unique
 * id derived from the table/file name so the rendered graph reflects real
 * topology — not every edge collapsing into a single `T -> D` pair as it
 * did in earlier versions.
 */
function generateMermaidDiagram(graph: LineageGraph): string {
  const lines: string[] = ["graph LR"];
  const sanitize = (s: string) => s.replace(/[^A-Za-z0-9_]/g, "_").slice(0, 40);

  const tables = Array.from(graph.tables.values()).slice(0, 20);
  const tableIds = new Map<string, string>();
  for (const table of tables) {
    const id = `t_${sanitize(table.name)}`;
    tableIds.set(table.name, id);
    lines.push(`  ${id}["${table.name}"]`);
  }

  const deps = graph.dependencies.slice(0, 30);
  const fileIds = new Map<string, string>();
  let fileCounter = 0;
  for (const dep of deps) {
    const tableId = tableIds.get(dep.referencedTable);
    if (!tableId) continue;
    let fileId = fileIds.get(dep.filePath);
    if (!fileId) {
      fileId = `f${fileCounter++}_${sanitize(dep.filePath.split("/").pop() ?? "file")}`;
      fileIds.set(dep.filePath, fileId);
      const label = dep.filePath.split("/").slice(-2).join("/");
      lines.push(`  ${fileId}["${label}"]`);
    }
    lines.push(`  ${tableId} -->|${dep.pattern}| ${fileId}`);
  }

  return lines.join("\n");
}

/**
 * Generate recommendations based on graph analysis
 */
function generateRecommendations(graph: LineageGraph): string[] {
  const recommendations: string[] = [];

  const tables = graph.tables.size || 0;
  const deps = graph.dependencies.length || 0;

  if (tables === 0) {
    recommendations.push("⚠️ No tables discovered. Check your SQL files or file patterns.");
  }

  if (deps === 0 && tables > 0) {
    recommendations.push(
      "⚠️ No dependencies found. Ensure Python/TypeScript files use the discovered tables."
    );
  }

  if (graph.warnings.length > 5) {
    recommendations.push(
      `⚠️ ${graph.warnings.length} warnings detected. Review scanner logs for parsing issues.`
    );
  }

  if (deps > 0 && tables > 0) {
    const avgDepsPerTable = deps / tables;
    if (avgDepsPerTable < 2) {
      recommendations.push(
        "💡 Low connectivity detected. Consider adding more comprehensive SQL parsing patterns."
      );
    }
  }

  if (recommendations.length === 0) {
    recommendations.push("✅ Graph looks healthy. Continue monitoring for schema changes.");
  }

  return recommendations;
}

/**
 * Generate a health report for the lineage graph
 */
export async function generateHealthReport(
  graph: LineageGraph,
  options: HealthReportOptions = {}
): Promise<HealthReport> {
  // outputPath is opt-in. The previous default wrote the file unconditionally
  // into a cwd-relative path, surprising callers that just wanted the
  // structured report in memory.
  const { outputPath, includeDiagram = true } = options;

  const tables = graph.tables.size || 0;
  const deps = graph.dependencies.length || 0;
  const filesScanned = new Set(graph.dependencies.map((d) => d.filePath)).size;
  const healthScore = calculateHealthScore(graph);
  const mermaidDiagram = includeDiagram ? generateMermaidDiagram(graph) : undefined;
  const recommendations = generateRecommendations(graph);

  const report: HealthReport = {
    timestamp: new Date().toISOString(),
    summary: {
      totalTables: tables,
      totalDependencies: deps,
      filesScanned,
      healthScore,
    },
    warnings: graph.warnings,
    recommendations,
    mermaidDiagram,
  };

  // Generate markdown content
  const markdown = formatHealthReportMarkdown(report);

  // Write to file only when the caller explicitly requested an outputPath.
  if (outputPath) {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, markdown, "utf-8");
  }

  return report;
}

/**
 * Format health report as Markdown
 */
export function formatHealthReportMarkdown(report: HealthReport): string {
  const lines: string[] = [
    `# Lineage Health Report`,
    `Generated: ${report.timestamp}`,
    ``,
    `## Summary`,
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Total Tables | ${report.summary.totalTables} |`,
    `| Total Dependencies | ${report.summary.totalDependencies} |`,
    `| Files Scanned | ${report.summary.filesScanned} |`,
    `| Health Score | ${report.summary.healthScore}/100 |`,
    ``,
  ];

  // Health indicator
  if (report.summary.healthScore >= 80) {
    lines.push(`🟢 **Status**: Healthy`);
  } else if (report.summary.healthScore >= 50) {
    lines.push(`🟡 **Status**: Fair`);
  } else {
    lines.push(`🔴 **Status**: Needs Attention`);
  }

  lines.push(``);

  // Warnings
  if (report.warnings.length > 0) {
    lines.push(`## Warnings`, ``);
    for (const warning of report.warnings) {
      lines.push(`- ⚠️ ${warning}`);
    }
    lines.push(``);
  }

  // Recommendations
  if (report.recommendations.length > 0) {
    lines.push(`## Recommendations`, ``);
    for (const rec of report.recommendations) {
      lines.push(`- ${rec}`);
    }
    lines.push(``);
  }

  // Diagram
  if (report.mermaidDiagram) {
    lines.push(`## Dependency Graph`, ``);
    lines.push("```mermaid");
    lines.push(report.mermaidDiagram);
    lines.push("```");
  }

  return lines.join("\n");
}
