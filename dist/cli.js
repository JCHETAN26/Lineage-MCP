#!/usr/bin/env node
import { resolve } from "path";
import { crawl } from "./crawler.js";
import { checkImpact } from "./tools/check-impact.js";
import { listAllTables, listLineage } from "./tools/list-lineage.js";
async function main() {
    const args = process.argv.slice(2);
    const command = (args[0] ?? "help");
    if (command === "help" || args.includes("--help") || args.includes("-h")) {
        printHelp();
        return;
    }
    const rootDir = getFlag(args, "--root") ?? ".";
    const resolvedRoot = resolve(rootDir);
    if (command === "scan") {
        const graph = await crawl({ rootDir: resolvedRoot });
        printSection("Scan Summary");
        console.log(`root: ${resolvedRoot}`);
        console.log(`tables: ${graph.tables.size}`);
        console.log(`dependencies: ${graph.dependencies.length}`);
        return;
    }
    if (command === "tables") {
        const graph = await crawl({ rootDir: resolvedRoot });
        const tables = listAllTables(graph).sort();
        printSection("Discovered Tables");
        console.log(`root: ${resolvedRoot}`);
        for (const table of tables) {
            console.log(`- ${table}`);
        }
        return;
    }
    if (command === "lineage") {
        const table = getPositional(args, 1);
        if (!table) {
            fail("Missing table name. Example: lineage table_name --root ./demo");
        }
        const graph = await crawl({ rootDir: resolvedRoot });
        const result = listLineage({ table, rootDir: resolvedRoot }, graph);
        printSection(`Lineage: ${table}`);
        console.log(result.tree);
        if (result.warnings.length > 0) {
            console.log("");
            console.log("Warnings");
            for (const warning of result.warnings)
                console.log(`- ${warning}`);
        }
        if (result.consumers.length > 0) {
            console.log("");
            console.log("Consumers");
            for (const consumer of result.consumers) {
                console.log(`- ${consumer.filePath}:${consumer.line} | ${consumer.pattern} | ${consumer.confidence} | ${capitalize(consumer.evidenceType)} | ${consumer.provenance}`);
            }
        }
        if (result.upstream.length > 0) {
            console.log("");
            console.log("Upstream");
            for (const upstream of result.upstream) {
                console.log(`- ${upstream.name} (${upstream.filePath}:${upstream.line})`);
            }
        }
        return;
    }
    if (command === "impact") {
        const table = getPositional(args, 1);
        if (!table) {
            fail("Missing table name. Example: impact table_name --change rename --root ./demo");
        }
        const changeType = getFlag(args, "--change");
        if (!changeType || !isChangeType(changeType)) {
            fail("Missing or invalid --change. Use rename | delete | type_change | add");
        }
        const column = getFlag(args, "--column");
        const newName = getFlag(args, "--new-name");
        const graph = await crawl({ rootDir: resolvedRoot });
        const result = await checkImpact({
            table,
            column: column ?? undefined,
            changeType,
            newName: newName ?? undefined,
            rootDir: resolvedRoot,
        }, graph);
        printSection(`Impact: ${column ? `${table}.${column}` : table}`);
        console.log(`change: ${changeType}${newName ? ` -> ${newName}` : ""}`);
        console.log(result.summary);
        if (result.warnings.length > 0) {
            console.log("");
            console.log("Warnings");
            for (const warning of result.warnings)
                console.log(`- ${warning}`);
        }
        if (result.affectedFiles.length > 0) {
            console.log("");
            console.log("Affected Files");
            for (const file of result.affectedFiles) {
                console.log(`- ${file.filePath}:${file.line} | ${file.confidence} | ${capitalize(file.evidenceType)} | ${file.provenance ?? "unknown"}`);
                if (file.suggestedFix)
                    console.log(`  fix: ${file.suggestedFix}`);
                if (file.snippet)
                    console.log(indentBlock(file.snippet, "  "));
            }
        }
        return;
    }
    fail(`Unknown command: ${command}`);
}
function capitalize(value) {
    if (!value)
        return "Unknown";
    return value[0].toUpperCase() + value.slice(1);
}
function printHelp() {
    console.log(`Lineage CLI

Commands:
  scan --root <dir>
  tables --root <dir>
  lineage <table> --root <dir>
  impact <table> --change <rename|delete|type_change|add> [--column <name>] [--new-name <name>] --root <dir>

Examples:
  node dist/cli.js scan --root ./demo
  node dist/cli.js tables --root /Users/chetan/Lineage-MCP/tmp-jaffle-shop
  node dist/cli.js lineage stg_orders --root /Users/chetan/Lineage-MCP/tmp-jaffle-shop
  node dist/cli.js impact stg_orders --change rename --root /Users/chetan/Lineage-MCP/tmp-jaffle-shop
  node dist/cli.js impact users --change rename --column email --new-name user_email --root ./demo
`);
}
function printSection(title) {
    console.log(`\n=== ${title} ===`);
}
function getFlag(args, name) {
    const index = args.indexOf(name);
    if (index === -1)
        return undefined;
    return args[index + 1];
}
function getPositional(args, index) {
    const positional = args.filter((arg, i) => {
        if (i === 0)
            return false;
        if (args[i - 1]?.startsWith("--"))
            return false;
        return !arg.startsWith("--");
    });
    return positional[index - 1];
}
function indentBlock(text, prefix) {
    return text
        .split("\n")
        .map((line) => `${prefix}${line}`)
        .join("\n");
}
function isChangeType(value) {
    return value === "rename" || value === "delete" || value === "type_change" || value === "add";
}
function fail(message) {
    process.stderr.write(`${message}\n`);
    process.exit(1);
}
main().catch((err) => {
    process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
});
//# sourceMappingURL=cli.js.map