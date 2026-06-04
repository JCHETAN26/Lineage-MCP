import { basename } from "path";
import type { TableNode, DependencyNode, ColumnDef } from "../types.js";

// Header-only match: locates the start of each CREATE TABLE statement. The
// body is parsed separately with a balanced-paren walker so a malformed
// statement (missing close paren) doesn't consume the next valid statement.
const CREATE_TABLE_HEADER_RE =
  /CREATE\s+(?:OR\s+REPLACE\s+)?(?:TEMP(?:ORARY)?\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?(\w+)`?\s*\(/gi;

const ALTER_TABLE_RENAME_COL_RE =
  /ALTER\s+TABLE\s+`?(\w+)`?\s+RENAME\s+COLUMN\s+`?(\w+)`?\s+TO\s+`?(\w+)`?/gi;

const ALTER_TABLE_ADD_RE =
  /ALTER\s+TABLE\s+`?(\w+)`?\s+ADD\s+(?:COLUMN\s+)?`?(\w+)`?\s+(\w+)/gi;

const ALTER_TABLE_DROP_RE =
  /ALTER\s+TABLE\s+`?(\w+)`?\s+DROP\s+(?:COLUMN\s+)?`?(\w+)`?/gi;

const DROP_TABLE_RE = /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?`?(\w+)`?/gi;
const TABLE_REFERENCE_RE = /\b(FROM|JOIN|INTO|UPDATE)\s+`?(\w+)`?/gi;
const DBT_REF_RE = /\{\{\s*ref\(\s*['"`]([\w.-]+)['"`]\s*\)\s*\}\}/gi;
const DBT_SOURCE_RE =
  /\{\{\s*source\(\s*['"`]([\w.-]+)['"`]\s*,\s*['"`]([\w.-]+)['"`]\s*\)\s*\}\}/gi;
const CTE_NAME_RE = /(?:\bWITH\b|,)\s*([\w]+)\s+AS\s*\(/gi;
const DBT_HINT_RE = /\{\{\s*(?:config|ref|source)\s*\(/i;

const COLUMN_DEF_RE = /^\s*`?(\w+)`?\s+(\w+(?:\s*\(\s*\d+(?:\s*,\s*\d+)?\s*\))?)/;

interface AlterTableChange {
  table: string;
  changeType: "rename_column" | "add_column" | "drop_column" | "drop_table";
  column?: string;
  newColumn?: string;
  dataType?: string;
  line: number;
}

export interface SqlScanResult {
  tables: TableNode[];
  alterations: AlterTableChange[];
  dependencies: DependencyNode[];
}

export function scanSqlFile(content: string, filePath: string): SqlScanResult {
  const cleanContent = stripComments(content);
  const tables: TableNode[] = [];
  const alterations: AlterTableChange[] = [];
  const dependencies: DependencyNode[] = [];
  const cteNames = extractCteNames(cleanContent);

  try {
    // Walk CREATE TABLE headers with a balanced-paren body parser. If the
    // body never closes (missing `)`) or encounters another CREATE TABLE
    // before closing, skip the statement entirely so it can't swallow the
    // next valid one.
    for (const header of cleanContent.matchAll(CREATE_TABLE_HEADER_RE)) {
      const tableName = header[1];
      const bodyStart = (header.index ?? 0) + header[0].length;
      const parsed = parseBalancedBody(cleanContent, bodyStart);
      if (!parsed) continue;
      const line = getLineNumber(cleanContent, header.index ?? 0);
      const columns = parseColumns(parsed.body);
      tables.push({ type: "table", name: tableName, columns, filePath, line });
    }

    if (tables.length === 0 && DBT_HINT_RE.test(cleanContent)) {
      const inferredName = basename(filePath).replace(/\.[^.]+$/, "");
      tables.push({
        type: "table",
        name: inferredName,
        columns: [],
        filePath,
        line: 1,
      });
    }

    for (const match of cleanContent.matchAll(ALTER_TABLE_RENAME_COL_RE)) {
      alterations.push({
        table: match[1],
        changeType: "rename_column",
        column: match[2],
        newColumn: match[3],
        line: getLineNumber(cleanContent, match.index ?? 0),
      });
    }

    for (const match of cleanContent.matchAll(ALTER_TABLE_ADD_RE)) {
      alterations.push({
        table: match[1],
        changeType: "add_column",
        column: match[2],
        dataType: match[3],
        line: getLineNumber(cleanContent, match.index ?? 0),
      });
    }

    for (const match of cleanContent.matchAll(ALTER_TABLE_DROP_RE)) {
      alterations.push({
        table: match[1],
        changeType: "drop_column",
        column: match[2],
        line: getLineNumber(cleanContent, match.index ?? 0),
      });
    }

    for (const match of cleanContent.matchAll(DROP_TABLE_RE)) {
      alterations.push({
        table: match[1],
        changeType: "drop_table",
        line: getLineNumber(cleanContent, match.index ?? 0),
      });
    }

    for (const match of cleanContent.matchAll(DBT_REF_RE)) {
      const tableName = match[1];
      if (cteNames.has(tableName.toLowerCase())) continue;
      dependencies.push({
        type: "dependency",
        filePath,
        line: getLineNumber(cleanContent, match.index ?? 0),
        pattern: `ref(${tableName})`,
        provenance: "dbt ref() scan",
        evidenceType: "verified",
        referencedTable: tableName,
        confidence: "high",
        language: "sql",
      });
    }

    for (const match of cleanContent.matchAll(DBT_SOURCE_RE)) {
      const tableName = match[2];
      if (cteNames.has(tableName.toLowerCase())) continue;
      dependencies.push({
        type: "dependency",
        filePath,
        line: getLineNumber(cleanContent, match.index ?? 0),
        pattern: `source(${match[1]}, ${tableName})`,
        provenance: "dbt source() scan",
        evidenceType: "verified",
        referencedTable: tableName,
        confidence: "high",
        language: "sql",
      });
    }

    for (const match of cleanContent.matchAll(TABLE_REFERENCE_RE)) {
      const keyword = match[1].toUpperCase();
      const tableName = match[2];
      const line = getLineNumber(cleanContent, match.index ?? 0);

      if (shouldSkipReference(keyword, tableName, cteNames)) continue;

      dependencies.push({
        type: "dependency",
        filePath,
        line,
        pattern: `${keyword} ${tableName}`,
        provenance: "raw SQL clause scan",
        evidenceType: "heuristic",
        referencedTable: tableName,
        confidence: "high",
        language: "sql",
      });
    }
  } catch {
    // malformed SQL — return partial results
  }

  return { tables, alterations, dependencies: deduplicateDependencies(dependencies) };
}

function parseColumns(block: string): ColumnDef[] {
  const columns: ColumnDef[] = [];
  const cleanBlock = block.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

  for (const line of cleanBlock.split(",")) {
    const trimmed = line.trim();
    if (!trimmed || /^\s*(PRIMARY|UNIQUE|CHECK|FOREIGN|INDEX|KEY)\b/i.test(trimmed)) {
      continue;
    }
    const m = COLUMN_DEF_RE.exec(trimmed);
    if (m) {
      columns.push({ name: m[1], dataType: m[2] });
    }
  }
  return columns;
}

/**
 * Walk a CREATE TABLE body starting just after the opening `(`. Returns the
 * body text (without the trailing close paren) and the index of the close
 * paren in `content`. Returns null if the body is malformed:
 *   - hit `;` before depth returns to 0 (statement terminated unclosed), or
 *   - hit another `CREATE ... TABLE` keyword before closing, or
 *   - reached EOF without closing.
 *
 * This is what stops a broken CREATE TABLE from greedily eating the next one.
 */
function parseBalancedBody(
  content: string,
  start: number
): { body: string; closeIdx: number } | null {
  let depth = 1;
  let i = start;
  const tableKeywordRe = /^CREATE\s+(?:OR\s+REPLACE\s+)?(?:TEMP(?:ORARY)?\s+)?TABLE\b/i;
  while (i < content.length && depth > 0) {
    const c = content[i];
    if (c === "(") {
      depth++;
    } else if (c === ")") {
      depth--;
      if (depth === 0) {
        return { body: content.slice(start, i), closeIdx: i };
      }
    } else if (c === ";") {
      return null; // statement terminated without closing paren
    } else if (
      (c === "C" || c === "c") &&
      tableKeywordRe.test(content.slice(i, i + 60))
    ) {
      return null; // next CREATE TABLE encountered — current is malformed
    }
    i++;
  }
  return null;
}

function stripComments(content: string): string {
  return content
    .replace(/\{#[\s\S]*?#\}/g, preserveNewlines)
    .replace(/\/\*[\s\S]*?\*\//g, preserveNewlines)
    .replace(/--[^\n]*/g, preserveNewlines);
}

function preserveNewlines(match: string): string {
  return match.replace(/[^\n]/g, " ");
}

function extractCteNames(content: string): Set<string> {
  const names = new Set<string>();
  for (const match of content.matchAll(CTE_NAME_RE)) {
    names.add(match[1].toLowerCase());
  }
  return names;
}

function getLineNumber(content: string, index: number): number {
  return content.slice(0, index).split("\n").length;
}

function shouldSkipReference(
  keyword: string,
  tableName: string,
  cteNames: Set<string>
): boolean {
  if (cteNames.has(tableName.toLowerCase())) return true;
  return keyword === "INTO" && cteNames.has(tableName.toLowerCase());
}

function deduplicateDependencies(deps: DependencyNode[]): DependencyNode[] {
  const seen = new Set<string>();
  return deps.filter((dep) => {
    const key = `${dep.filePath}:${dep.line}:${dep.pattern}:${dep.referencedTable}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
