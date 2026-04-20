import type { DependencyNode } from "../types.js";

interface Pattern {
  re: RegExp;
  confidence: "high" | "medium" | "low";
  label: string;
  provenance: string;
}

const PATTERNS: Pattern[] = [
  // pd.read_sql / read_sql_query / read_sql_table
  {
    re: /pd\.read_sql(?:_query|_table)?\s*\(\s*(?:f?["'`]([^"'`]+)["'`]|[^,)]+)/gi,
    confidence: "high",
    label: "pd.read_sql",
    provenance: "pandas SQL reader scan",
  },
  // pd.read_table(tableName)
  {
    re: /pd\.read_table\s*\(\s*(?:f?["'`]([^"'`]+)["'`])/gi,
    confidence: "high",
    label: "pd.read_table",
    provenance: "pandas table reader scan",
  },
  // SQLAlchemy: session.query(Model) or db.session.query(Model)
  {
    re: /\.query\s*\(\s*(\w+)\s*\)/gi,
    confidence: "medium",
    label: "sqlalchemy.query",
    provenance: "SQLAlchemy query scan",
  },
  // SQLAlchemy: select(Model) or select(Model.__table__)
  {
    re: /select\s*\(\s*(\w+)(?:\.__table__)?\s*\)/gi,
    confidence: "medium",
    label: "sqlalchemy.select",
    provenance: "SQLAlchemy select scan",
  },
  // PySpark: spark.sql(...)
  {
    re: /spark\.sql\s*\(\s*(?:f?["'`]([^"'`]+)["'`])/gi,
    confidence: "high",
    label: "spark.sql",
    provenance: "Spark SQL scan",
  },
  // PySpark: spark.read.table("tableName")
  {
    re: /spark\.read\.(?:table|csv|parquet|json)\s*\(\s*f?["'`]([^"'`]+)["'`]/gi,
    confidence: "high",
    label: "spark.read",
    provenance: "Spark reader scan",
  },
  // Raw SQL strings: FROM tableName, JOIN tableName
  {
    re: /["'`]\s*SELECT\s[^"'`]*\bFROM\s+(\w+)/gi,
    confidence: "high",
    label: "raw_sql_string",
    provenance: "raw SQL string scan",
  },
  // psycopg2 / pymysql execute
  {
    re: /\.execute\s*\(\s*f?["'`][^"'`]*\bFROM\s+(\w+)/gi,
    confidence: "high",
    label: "db.execute",
    provenance: "database execute scan",
  },
];

const TABLE_EXTRACTOR_RE = /\b(?:FROM|JOIN)\s+(\w+)/gi;

export function scanPythonFile(content: string, filePath: string): DependencyNode[] {
  const deps: DependencyNode[] = [];
  const lines = content.split("\n");

  for (const { re, confidence, label, provenance } of PATTERNS) {
    re.lastIndex = 0;
    for (const match of content.matchAll(re)) {
      const line = getLineNumber(content, match.index ?? 0);
      const fullMatch = match[0];
      const capturedValue = match[1] ?? "";

      // Extract table references from SQL strings embedded in the match
      const tables = extractTableNames(capturedValue, fullMatch);

      for (const tableName of tables) {
        if (!tableName || tableName.length < 2) continue;
        deps.push({
          type: "dependency",
          filePath,
          line,
          pattern: label,
          provenance,
          evidenceType: "heuristic",
          referencedTable: tableName,
          confidence,
          language: "python",
        });
      }
    }
  }

  return deduplicateDeps(deps);
}

function extractTableNames(capturedValue: string, fullMatch: string): string[] {
  const names = new Set<string>();

  // If captured value looks like a SQL fragment, extract FROM/JOIN targets
  if (/SELECT|FROM|JOIN/i.test(capturedValue)) {
    for (const m of capturedValue.matchAll(TABLE_EXTRACTOR_RE)) {
      names.add(m[1]);
    }
  } else if (capturedValue.trim()) {
    // Captured value is likely the table/model name directly
    const cleaned = capturedValue.split(/[,\s]/)[0].trim();
    if (cleaned) names.add(cleaned);
  }

  // Also scan inside any embedded SQL
  if (/SELECT|FROM|JOIN/i.test(fullMatch)) {
    for (const m of fullMatch.matchAll(TABLE_EXTRACTOR_RE)) {
      names.add(m[1]);
    }
  }

  return Array.from(names);
}

function getLineNumber(content: string, index: number): number {
  return content.slice(0, index).split("\n").length;
}

function deduplicateDeps(deps: DependencyNode[]): DependencyNode[] {
  const seen = new Set<string>();
  return deps.filter((d) => {
    const key = `${d.filePath}:${d.line}:${d.referencedTable}:${d.referencedColumn ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
