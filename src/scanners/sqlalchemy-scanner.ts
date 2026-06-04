import type { TableNode, ColumnDef } from "../types.js";
import { stripPythonNonCode } from "./python-scanner.js";

/**
 * SQLAlchemy declarative-model scanner.
 *
 * Detects table definitions of the shape:
 *
 *   class TaskInstance(Base):
 *       __tablename__ = "task_instance"
 *       id = Column(Integer, primary_key=True)
 *       dag_id = Column(String(250))
 *
 * Registers the table under BOTH names — the `__tablename__` value and the
 * class name — so a SQL file referring to "task_instance" and Python code
 * doing `session.query(TaskInstance)` both resolve to the same asset.
 *
 * Recognized base classes:
 *   - Base (the canonical declarative_base() output)
 *   - DeclarativeBase (SQLAlchemy 2.x typed style)
 *   - db.Model (Flask-SQLAlchemy)
 *
 * Pydantic's `BaseModel` is intentionally NOT matched (it's not a table).
 */
const ORM_BASE_CLASSES = ["Base", "DeclarativeBase", "db\\.Model"];

const CLASS_DECL_RE = new RegExp(
  `^class\\s+(\\w+)\\s*\\(([^)]*)\\)\\s*:`,
  "gm"
);

const TABLENAME_RE = /__tablename__\s*=\s*["']([^"']+)["']/;
const COLUMN_RE = /^\s+(\w+)\s*(?::\s*[^=\n]+)?=\s*(?:Column|mapped_column)\s*\(/gm;

function inheritsFromOrmBase(bases: string): boolean {
  const baseList = bases.split(",").map((b) => b.trim());
  for (const base of baseList) {
    for (const ormBase of ORM_BASE_CLASSES) {
      if (new RegExp(`^${ormBase}(?:\\[|$)`).test(base)) return true;
    }
  }
  return false;
}

function getLineNumber(content: string, index: number): number {
  return content.slice(0, index).split("\n").length;
}

// Fast pre-filter: skip files that clearly contain no ORM base class.
// Avoids running the expensive comment-stripper + regex scans on the ~95%
// of Python files in a real repo that have nothing to do with SQLAlchemy.
const PREFILTER_RE = /\bclass\s+\w+\s*\([^)]*\b(?:Base|DeclarativeBase|db\.Model)\b/;

export function scanSqlAlchemyFile(content: string, filePath: string): TableNode[] {
  if (!PREFILTER_RE.test(content)) return [];
  const stripped = stripPythonNonCode(content);
  const tables: TableNode[] = [];

  // Collect all class headers so we can compute each class's body slice
  // (from this class header to the next class header at the same or shallower
  // indent level — approximated as "the next top-level class").
  const classMatches: Array<{ index: number; name: string; bases: string }> = [];
  for (const m of stripped.matchAll(CLASS_DECL_RE)) {
    classMatches.push({
      index: m.index ?? 0,
      name: m[1],
      bases: m[2],
    });
  }

  for (let i = 0; i < classMatches.length; i++) {
    const { index, name, bases } = classMatches[i];
    if (!inheritsFromOrmBase(bases)) continue;

    // Class body ends at the next class header or EOF — approximation that
    // catches the common file layout (one class per top-level block).
    const bodyEnd =
      i + 1 < classMatches.length ? classMatches[i + 1].index : stripped.length;
    const body = stripped.slice(index, bodyEnd);

    const tableNameMatch = TABLENAME_RE.exec(body);
    const tableName = tableNameMatch ? tableNameMatch[1] : name.toLowerCase();

    const columns: ColumnDef[] = [];
    const seenColumns = new Set<string>();
    for (const colMatch of body.matchAll(COLUMN_RE)) {
      const colName = colMatch[1];
      if (seenColumns.has(colName)) continue;
      seenColumns.add(colName);
      columns.push({ name: colName });
    }

    const line = getLineNumber(content, index);
    tables.push({ type: "table", name: tableName, columns, filePath, line });

    // Register the Python class name as an alias when it differs from the
    // table name — Python code referencing the class will resolve to the
    // same asset as SQL referencing the table.
    if (name !== tableName) {
      tables.push({ type: "table", name, columns, filePath, line });
    }
  }

  return tables;
}
