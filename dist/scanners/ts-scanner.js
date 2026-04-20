const PATTERNS = [
    // Raw SQL template literals or strings: FROM tableName
    {
        re: /[`"']\s*SELECT\s[^`"']*\bFROM\s+(\w+)/gi,
        confidence: "high",
        label: "raw_sql",
        provenance: "raw SQL string scan",
    },
    // Knex: knex("tableName") or knex.table("tableName")
    {
        re: /knex(?:\.table)?\s*\(\s*["'`](\w+)["'`]/gi,
        confidence: "high",
        label: "knex",
        provenance: "Knex API scan",
    },
    // Prisma: prisma.tableName.findMany / findOne / create etc.
    {
        re: /prisma\.\s*(\w+)\s*\.\s*(?:findMany|findFirst|findUnique|create|update|delete|upsert|count)/gi,
        confidence: "high",
        label: "prisma",
        provenance: "Prisma client usage",
    },
    // TypeORM: getRepository("TableName") / repository.find()
    {
        re: /getRepository\s*\(\s*["'`](\w+)["'`]/gi,
        confidence: "high",
        label: "typeorm.getRepository",
        provenance: "TypeORM repository scan",
    },
    // TypeORM: @Entity("table_name") decorator
    {
        re: /@Entity\s*\(\s*["'`](\w+)["'`]/gi,
        confidence: "high",
        label: "typeorm.entity",
        provenance: "TypeORM entity decorator scan",
    },
    // Sequelize: sequelize.define("tableName")
    {
        re: /\.define\s*\(\s*["'`](\w+)["'`]/gi,
        confidence: "medium",
        label: "sequelize.define",
        provenance: "Sequelize model definition scan",
    },
    // Sequelize: Model.findAll / findOne / create
    {
        re: /(\w+)\.(?:findAll|findOne|findByPk|create|update|destroy)\s*\(/gi,
        confidence: "low",
        label: "sequelize.model",
        provenance: "Sequelize model usage scan",
    },
    // pg / mysql2: client.query("SELECT ... FROM tableName")
    {
        re: /\.query\s*\(\s*[`"']\s*(?:SELECT|INSERT|UPDATE|DELETE)[^`"']*\bFROM\s+(\w+)/gi,
        confidence: "high",
        label: "pg.query",
        provenance: "SQL client query scan",
    },
];
const TABLE_EXTRACTOR_RE = /\b(?:FROM|JOIN)\s+(\w+)/gi;
const RESERVED_WORDS = new Set([
    "WHERE", "SELECT", "INSERT", "UPDATE", "DELETE", "CREATE", "DROP",
    "ALTER", "TABLE", "INDEX", "VIEW", "SET", "INTO", "VALUES", "AND",
    "OR", "NOT", "NULL", "IS", "IN", "LIKE", "BETWEEN", "AS", "ON",
    "LEFT", "RIGHT", "INNER", "OUTER", "CROSS", "NATURAL", "FULL",
    "GROUP", "ORDER", "BY", "HAVING", "LIMIT", "OFFSET", "UNION",
    "ALL", "DISTINCT", "COUNT", "SUM", "AVG", "MIN", "MAX",
]);
export function scanTsFile(content, filePath) {
    const deps = [];
    const language = filePath.endsWith(".ts") || filePath.endsWith(".tsx") ? "typescript" : "javascript";
    for (const { re, confidence, label, provenance } of PATTERNS) {
        re.lastIndex = 0;
        for (const match of content.matchAll(re)) {
            const line = getLineNumber(content, match.index ?? 0);
            const captured = match[1] ?? "";
            const tables = extractTables(captured, match[0]);
            for (const tableName of tables) {
                if (!tableName || tableName.length < 2)
                    continue;
                if (RESERVED_WORDS.has(tableName.toUpperCase()))
                    continue;
                deps.push({
                    type: "dependency",
                    filePath,
                    line,
                    pattern: label,
                    provenance,
                    evidenceType: label === "prisma" ? "heuristic" : "heuristic",
                    referencedTable: tableName,
                    confidence,
                    language,
                });
            }
        }
    }
    return deduplicateDeps(deps);
}
function extractTables(captured, fullMatch) {
    const names = new Set();
    if (/SELECT|FROM|JOIN/i.test(captured)) {
        for (const m of captured.matchAll(TABLE_EXTRACTOR_RE)) {
            names.add(m[1]);
        }
    }
    else if (captured.trim()) {
        names.add(captured.trim());
    }
    if (/FROM|JOIN/i.test(fullMatch)) {
        for (const m of fullMatch.matchAll(TABLE_EXTRACTOR_RE)) {
            names.add(m[1]);
        }
    }
    return Array.from(names);
}
function getLineNumber(content, index) {
    return content.slice(0, index).split("\n").length;
}
function deduplicateDeps(deps) {
    const seen = new Set();
    return deps.filter((d) => {
        const key = `${d.filePath}:${d.line}:${d.referencedTable}`;
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
}
//# sourceMappingURL=ts-scanner.js.map