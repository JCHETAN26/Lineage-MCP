import type { TableNode, ColumnDef } from "../types.js";

const MODEL_RE = /\bmodel\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
const FIELD_RE = /^\s*(\w+)\s+([A-Za-z][\w\[\]?]*)/;
const BLOCKED_FIELD_PREFIXES = new Set(["@@", "@"]);

export function scanPrismaSchema(content: string, filePath: string): TableNode[] {
  const tables: TableNode[] = [];
  const cleanContent = stripComments(content);

  for (const match of cleanContent.matchAll(MODEL_RE)) {
    const name = match[1];
    const body = match[2];
    const line = getLineNumber(cleanContent, match.index ?? 0);

    tables.push({
      type: "table",
      name,
      columns: parseFields(body),
      filePath,
      line,
    });
  }

  return tables;
}

function parseFields(body: string): ColumnDef[] {
  const columns: ColumnDef[] = [];

  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    if (BLOCKED_FIELD_PREFIXES.has(line.slice(0, 2)) || line.startsWith("//")) continue;

    const match = FIELD_RE.exec(rawLine);
    if (!match) continue;

    columns.push({
      name: match[1],
      dataType: match[2],
    });
  }

  return columns;
}

function stripComments(content: string): string {
  return content.replace(/\/\/[^\n]*/g, "");
}

function getLineNumber(content: string, index: number): number {
  return content.slice(0, index).split("\n").length;
}
