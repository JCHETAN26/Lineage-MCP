import { z } from "zod";
import type { LineageGraph, TableNode, ColumnDef } from "../types.js";

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
  const { graph, tables: specifiedTables } = input;

  const findings: PIIFinding[] = [];
  const tablesToAudit = specifiedTables || Object.keys(graph.tables || {});

  for (const tableName of tablesToAudit) {
    const table = graph.tables?.[tableName] as TableNode | undefined;
    if (!table) continue;

    // Check each column in the table
    for (const column of table.columns || []) {
      const { riskLevel, reasons } = checkPIIRisk(column.name);

      if (riskLevel !== "low") {
        // Find downstream dependencies (who consumes this column)
        const flows = graph.edges
          ?.filter((edge: any) => edge.source === `${tableName}.${column.name}`)
          .map((edge: any) => ({
            fromTable: tableName,
            fromColumn: column.name,
            toFile: edge.target || "unknown",
            toLine: edge.line || 0,
          })) || [];

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
    totalTablesScanned: tablesToAudit.length,
    findingsCount: findings.length,
    findings,
    summary,
  };
}
