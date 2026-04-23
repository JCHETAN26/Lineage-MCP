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
 * Calculate health score based on graph state
 */
function calculateHealthScore(graph: LineageGraph): number {
  const tables = graph.tables.size || 0;
  const deps = graph.dependencies.length || 0;
  const warnings = (graph.warnings || []).length;

  // Base score: 100
  // -10 for each warning
  // Bonus if dependencies exist and are well-connected
  let score = 100;
  score -= Math.min(warnings * 10, 30);

  if (tables > 0 && deps > 0) {
    const avgDepsPerTable = deps / tables;
    // Bonus for good connectivity (5-10 deps per table is healthy)
    if (avgDepsPerTable >= 5 && avgDepsPerTable <= 10) {
      score += 10;
    }
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Generate Mermaid diagram from the lineage graph
 */
function generateMermaidDiagram(graph: LineageGraph): string {
  const lines: string[] = ["graph LR"];

  // Add table nodes
  const tables = Array.from(graph.tables.values());
  for (const table of tables.slice(0, 20)) {
    // Limit to 20 for readability
    lines.push(`  T["${table.name}"]`);
  }

  // Add dependencies (limited to avoid clutter)
  const deps = graph.dependencies.slice(0, 30);
  for (const dep of deps) {
    lines.push(
      `  T -->|"${dep.filePath.split("/").pop()}"| D["${dep.filePath.split("/").slice(-2, -1)}"]`
    );
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
  const { outputPath = ".lineage/lineage_health_report.md", includeDiagram = true } = options;

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

  // Write to file if path provided
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
