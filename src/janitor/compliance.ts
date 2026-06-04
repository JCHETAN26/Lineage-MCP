import { z } from "zod";
import type { LineageGraph, TableNode } from "../types.js";

export const AuditPIIComplianceSchema = z.object({
  graph: z.any().describe("The lineage graph to audit"),
  tables: z.array(z.string()).optional().describe("Specific tables to audit (if empty, audits all)"),
});

export type AuditPIIComplianceInput = z.infer<typeof AuditPIIComplianceSchema>;

export interface PIIFinding {
  table: string;
  column: string;
  riskLevel: "high" | "medium" | "low";
  reason: string;
  flows: Array<{
    fromTable: string;
    fromColumn: string;
    toFile: string;
    toLine: number;
  }>;
}

export interface PIIComplianceReport {
  timestamp: string;
  totalTablesScanned: number;
  findingsCount: number;
  findings: PIIFinding[];
  summary: string;
}

// High-risk PII patterns
const PII_PATTERNS = {
  HIGH_RISK: [
    { pattern: /ssn|social_security|social security/i, name: "Social Security Number" },
    { pattern: /credit_card|cc_number|card_number/i, name: "Credit Card Number" },
    { pattern: /iban|swift/i, name: "Bank Account (IBAN/SWIFT)" },
    { pattern: /passport|passport_number/i, name: "Passport Number" },
    { pattern: /drivers_license|driver_license|dl_number/i, name: "Driver's License" },
    { pattern: /phone|telephone|cell_phone|mobile/i, name: "Phone Number" },
    { pattern: /email|e_mail|mail_address/i, name: "Email Address" },
    { pattern: /password|pwd|secret|api_key|token/i, name: "Credential/Secret" },
  ],
  MEDIUM_RISK: [
    { pattern: /date_of_birth|dob|birthdate/i, name: "Date of Birth" },
    { pattern: /address|street|city|state|zip|postal/i, name: "Physical Address" },
    { pattern: /first_name|last_name|full_name|name/i, name: "Full Name" },
    { pattern: /income|salary|wage|compensation/i, name: "Income Data" },
    { pattern: /medical|health|diagnosis|treatment/i, name: "Health Information" },
  ],
};

/**
 * Check if a column name matches a PII pattern
 */
function checkPIIRisk(columnName: string): { riskLevel: "high" | "medium" | "low"; reasons: string[] } {
  const reasons: string[] = [];

  for (const finding of PII_PATTERNS.HIGH_RISK) {
    if (finding.pattern.test(columnName)) {
      reasons.push(`Matches HIGH_RISK pattern: ${finding.name}`);
    }
  }

  if (reasons.length > 0) {
    return { riskLevel: "high", reasons };
  }

  for (const finding of PII_PATTERNS.MEDIUM_RISK) {
    if (finding.pattern.test(columnName)) {
      reasons.push(`Matches MEDIUM_RISK pattern: ${finding.name}`);
    }
  }

  if (reasons.length > 0) {
    return { riskLevel: "medium", reasons };
  }

  return { riskLevel: "low", reasons: [] };
}

/**
 * Audit the lineage graph for PII exposure
 */
export async function auditPIICompliance(
  input: AuditPIIComplianceInput
): Promise<PIIComplianceReport> {
  const graph = input.graph as LineageGraph;
  const specifiedTables = input.tables;

  const findings: PIIFinding[] = [];
  // graph.tables is a Map<string, TableNode> — not a plain object.
  // The previous implementation used Object.keys(map) which always returned []
  // and so produced an empty audit. Use Map iteration instead.
  const tablesToAudit = specifiedTables ?? Array.from(graph.tables.keys());

  for (const tableName of tablesToAudit) {
    const table: TableNode | undefined = graph.tables.get(tableName);
    if (!table) continue;

    for (const column of table.columns || []) {
      const { riskLevel, reasons } = checkPIIRisk(column.name);

      if (riskLevel !== "low") {
        // Trace downstream consumers via graph.dependencies (the graph type
        // has no `edges` field — that was a stale reference). A dep with
        // matching referencedTable/referencedColumn is a downstream flow.
        const flows = graph.dependencies
          .filter(
            (d) =>
              d.referencedTable === tableName &&
              (d.referencedColumn ? d.referencedColumn === column.name : true)
          )
          .map((d) => ({
            fromTable: tableName,
            fromColumn: column.name,
            toFile: d.filePath,
            toLine: d.line,
          }));

        findings.push({
          table: tableName,
          column: column.name,
          riskLevel,
          reason: reasons.join("; "),
          flows,
        });
      }
    }
  }

  const summary =
    findings.length === 0
      ? "✅ No PII exposure detected"
      : `⚠️ ${findings.length} potential PII exposure(s) found. Review high-risk findings immediately.`;

  return {
    timestamp: new Date().toISOString(),
    // Only count tables that actually existed in the graph.
    totalTablesScanned: tablesToAudit.filter((t) => graph.tables.has(t)).length,
    findingsCount: findings.length,
    findings,
    summary,
  };
}
