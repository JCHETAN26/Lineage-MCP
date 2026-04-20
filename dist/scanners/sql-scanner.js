import { basename } from "path";
const CREATE_TABLE_RE = /CREATE\s+(?:OR\s+REPLACE\s+)?(?:TEMP(?:ORARY)?\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?(\w+)`?\s*\(([^;]*)\)/gis;
const ALTER_TABLE_RENAME_COL_RE = /ALTER\s+TABLE\s+`?(\w+)`?\s+RENAME\s+COLUMN\s+`?(\w+)`?\s+TO\s+`?(\w+)`?/gi;
const ALTER_TABLE_ADD_RE = /ALTER\s+TABLE\s+`?(\w+)`?\s+ADD\s+(?:COLUMN\s+)?`?(\w+)`?\s+(\w+)/gi;
const ALTER_TABLE_DROP_RE = /ALTER\s+TABLE\s+`?(\w+)`?\s+DROP\s+(?:COLUMN\s+)?`?(\w+)`?/gi;
const DROP_TABLE_RE = /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?`?(\w+)`?/gi;
const TABLE_REFERENCE_RE = /\b(FROM|JOIN|INTO|UPDATE)\s+`?(\w+)`?/gi;
const DBT_REF_RE = /\{\{\s*ref\(\s*['"`]([\w.-]+)['"`]\s*\)\s*\}\}/gi;
const DBT_SOURCE_RE = /\{\{\s*source\(\s*['"`]([\w.-]+)['"`]\s*,\s*['"`]([\w.-]+)['"`]\s*\)\s*\}\}/gi;
const CTE_NAME_RE = /(?:\bWITH\b|,)\s*([\w]+)\s+AS\s*\(/gi;
const DBT_HINT_RE = /\{\{\s*(?:config|ref|source)\s*\(/i;
const COLUMN_DEF_RE = /^\s*`?(\w+)`?\s+(\w+(?:\s*\(\s*\d+(?:\s*,\s*\d+)?\s*\))?)/;
export function scanSqlFile(content, filePath) {
    const cleanContent = stripComments(content);
    const tables = [];
    const alterations = [];
    const dependencies = [];
    const cteNames = extractCteNames(cleanContent);
    try {
        for (const match of cleanContent.matchAll(CREATE_TABLE_RE)) {
            const tableName = match[1];
            const columnBlock = match[2];
            const line = getLineNumber(cleanContent, match.index ?? 0);
            const columns = parseColumns(columnBlock);
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
            if (cteNames.has(tableName.toLowerCase()))
                continue;
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
            if (cteNames.has(tableName.toLowerCase()))
                continue;
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
            if (shouldSkipReference(keyword, tableName, cteNames))
                continue;
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
    }
    catch {
        // malformed SQL — return partial results
    }
    return { tables, alterations, dependencies: deduplicateDependencies(dependencies) };
}
function parseColumns(block) {
    const columns = [];
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
function stripComments(content) {
    return content
        .replace(/\{#[\s\S]*?#\}/g, preserveNewlines)
        .replace(/\/\*[\s\S]*?\*\//g, preserveNewlines)
        .replace(/--[^\n]*/g, preserveNewlines);
}
function preserveNewlines(match) {
    return match.replace(/[^\n]/g, " ");
}
function extractCteNames(content) {
    const names = new Set();
    for (const match of content.matchAll(CTE_NAME_RE)) {
        names.add(match[1].toLowerCase());
    }
    return names;
}
function getLineNumber(content, index) {
    return content.slice(0, index).split("\n").length;
}
function shouldSkipReference(keyword, tableName, cteNames) {
    if (cteNames.has(tableName.toLowerCase()))
        return true;
    return keyword === "INTO" && cteNames.has(tableName.toLowerCase());
}
function deduplicateDependencies(deps) {
    const seen = new Set();
    return deps.filter((dep) => {
        const key = `${dep.filePath}:${dep.line}:${dep.pattern}:${dep.referencedTable}`;
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
}
//# sourceMappingURL=sql-scanner.js.map