export function createGraph() {
    return {
        tables: new Map(),
        dependencies: [],
        warnings: [],
    };
}
export function mergeGraph(target, source) {
    for (const [name, table] of source.tables) {
        target.tables.set(name, table);
    }
    for (const dep of source.dependencies) {
        if (!hasDuplicate(target.dependencies, dep)) {
            target.dependencies.push(dep);
        }
    }
    for (const warning of source.warnings) {
        if (!target.warnings.includes(warning)) {
            target.warnings.push(warning);
        }
    }
}
function hasDuplicate(deps, candidate) {
    return deps.some((d) => d.filePath === candidate.filePath &&
        d.line === candidate.line &&
        d.referencedTable === candidate.referencedTable &&
        d.referencedColumn === candidate.referencedColumn);
}
export function getTableNames(graph) {
    return Array.from(graph.tables.keys());
}
export function getDependenciesForTable(graph, tableName) {
    const lower = tableName.toLowerCase();
    return graph.dependencies.filter((d) => d.referencedTable.toLowerCase() === lower);
}
export function getDependenciesForColumn(graph, tableName, columnName) {
    const tLower = tableName.toLowerCase();
    const cLower = columnName.toLowerCase();
    return graph.dependencies.filter((d) => d.referencedTable.toLowerCase() === tLower &&
        d.referencedColumn?.toLowerCase() === cLower);
}
export function buildLineageTree(graph, tableName, columnName) {
    const table = graph.tables.get(tableName) ?? graph.tables.get(tableName.toLowerCase());
    const deps = columnName
        ? getDependenciesForColumn(graph, tableName, columnName)
        : getDependenciesForTable(graph, tableName);
    const assetLabel = columnName ? `${tableName}.${columnName}` : tableName;
    const lines = [`${assetLabel}`];
    if (table) {
        lines.push(`  defined in: ${table.filePath}:${table.line}`);
        if (!columnName) {
            lines.push(`  columns: ${table.columns.map((c) => c.name).join(", ")}`);
        }
    }
    if (deps.length === 0) {
        lines.push("  (no dependents found)");
    }
    else {
        lines.push(`  consumers (${deps.length}):`);
        for (const dep of deps) {
            lines.push(`    ├─ ${dep.filePath}:${dep.line} [${dep.confidence}] — ${dep.pattern}`);
        }
    }
    return lines.join("\n");
}
//# sourceMappingURL=graph.js.map