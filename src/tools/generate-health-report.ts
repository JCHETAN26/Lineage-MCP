import { z } from "zod";
import { generateHealthReport } from "../janitor/report-generator.js";
import type { LineageGraph } from "../types.js";

export const GenerateHealthReportSchema = z.object({
  rootDir: z.string().default(".").describe("Root directory to scan"),
  outputPath: z
    .string()
    .optional()
    .describe("Path to write the health report (optional)"),
  includeDiagram: z.boolean().default(true).describe("Include Mermaid diagram"),
});

export type GenerateHealthReportInput = z.infer<typeof GenerateHealthReportSchema>;

/**
 * Generate a health report for the lineage graph
 */
export async function generateHealthReportTool(
  input: GenerateHealthReportInput,
  graph: LineageGraph
) {
  return generateHealthReport(graph, {
    outputPath: input.outputPath,
    includeDiagram: input.includeDiagram,
  });
}
