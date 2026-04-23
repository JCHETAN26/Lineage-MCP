import { z } from "zod";
import { auditPIICompliance } from "../janitor/compliance.js";

export const AuditPIIComplianceMCPSchema = z.object({
  tables: z.array(z.string()).optional().describe("Specific tables to audit (empty = all)"),
});

export type AuditPIIComplianceMCPInput = z.infer<typeof AuditPIIComplianceMCPSchema>;

/**
 * MCP Tool wrapper for PII compliance auditing
 */
export async function auditPIIComplianceTool(
  input: AuditPIIComplianceMCPInput,
  graph: any
) {
  return auditPIICompliance({
    graph,
    tables: input.tables,
  });
}
