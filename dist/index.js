#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { crawl } from "./crawler.js";
import { saveGraph, loadGraph } from "./cache.js";
import { checkImpact, CheckImpactSchema } from "./tools/check-impact.js";
import { listLineage, listAllTables, ListLineageSchema } from "./tools/list-lineage.js";
import { resolve } from "path";
const server = new Server({ name: "lineage-mcp", version: "0.2.0" }, { capabilities: { tools: {} } });
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
async function getGraph(rootDir, forceRescan = false) {
    if (!forceRescan) {
        const cached = loadGraph(rootDir, CACHE_TTL_MS);
        if (cached)
            return cached;
    }
    const graph = await crawl({ rootDir });
    saveGraph(rootDir, graph);
    return graph;
}
server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
        {
            name: "check_impact",
            description: "Analyze the blast radius of a schema change. Returns all files and line numbers that will break, with confidence levels and suggested fixes.",
            inputSchema: {
                type: "object",
                properties: {
                    table: { type: "string", description: "Table or feature name that is changing" },
                    column: { type: "string", description: "Column/feature name (optional)" },
                    changeType: {
                        type: "string",
                        enum: ["rename", "delete", "type_change", "add"],
                    },
                    newName: { type: "string", description: "New name (for renames)" },
                    rootDir: { type: "string", default: ".", description: "Root directory to scan" },
                },
                required: ["table", "changeType"],
            },
        },
        {
            name: "list_lineage",
            description: "Show the full dependency chain for a table or column: which files consume it, which upstream tables feed it, visual lineage tree.",
            inputSchema: {
                type: "object",
                properties: {
                    table: { type: "string" },
                    column: { type: "string", description: "Optional column to narrow lineage" },
                    rootDir: { type: "string", default: "." },
                },
                required: ["table"],
            },
        },
        {
            name: "list_tables",
            description: "List all tables and ML feature assets discovered in the scanned codebase.",
            inputSchema: {
                type: "object",
                properties: {
                    rootDir: { type: "string", default: "." },
                },
                required: [],
            },
        },
        {
            name: "scan",
            description: "Trigger a fresh rescan of the codebase, bypassing the cache. Use this after schema changes.",
            inputSchema: {
                type: "object",
                properties: {
                    rootDir: { type: "string", default: "." },
                },
                required: [],
            },
        },
        {
            name: "ping",
            description: "Health check.",
            inputSchema: { type: "object", properties: {}, required: [] },
        },
        {
            name: "get_sample_project",
            description: "Return the bundled sample project path and quick-start instructions.",
            inputSchema: { type: "object", properties: {}, required: [] },
        },
    ],
}));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const a = (args ?? {});
    try {
        if (name === "ping") {
            return { content: [{ type: "text", text: "pong — Lineage MCP v0.2.0 ✓" }] };
        }
        if (name === "scan") {
            const rootDir = a.rootDir ?? ".";
            const start = Date.now();
            const graph = await getGraph(rootDir, true);
            const elapsed = Date.now() - start;
            const text = `Scan complete in ${elapsed}ms.\n` +
                `  Tables found: ${graph.tables.size}\n` +
                `  Dependencies found: ${graph.dependencies.length}\n` +
                `  Cache written to: ${rootDir}/.lineage/cache.json` +
                formatWarningsBlock(graph.warnings);
            return { content: [{ type: "text", text }] };
        }
        if (name === "get_sample_project") {
            const samplePath = resolve(process.cwd(), "samples", "jaffle-shop-lite");
            const text = `Sample project path: ${samplePath}\n` +
                `Try:\n` +
                `  - list_tables with rootDir=${samplePath}\n` +
                `  - list_lineage for table=stg_orders\n` +
                `  - check_impact for table=stg_orders and changeType=rename`;
            return { content: [{ type: "text", text }] };
        }
        if (name === "check_impact") {
            const input = CheckImpactSchema.parse(a);
            const graph = await getGraph(input.rootDir);
            const report = await checkImpact(input, graph);
            return { content: [{ type: "text", text: formatImpactReport(report) }] };
        }
        if (name === "list_lineage") {
            const input = ListLineageSchema.parse(a);
            const graph = await getGraph(input.rootDir);
            const result = listLineage(input, graph);
            return { content: [{ type: "text", text: formatLineageResult(result) }] };
        }
        if (name === "list_tables") {
            const rootDir = a.rootDir ?? ".";
            const graph = await getGraph(rootDir);
            const tables = listAllTables(graph);
            const text = tables.length === 0
                ? "No tables or ML assets found."
                : `Discovered assets (${tables.length}):\n${tables.map((t) => `  • ${t}`).join("\n")}`;
            return { content: [{ type: "text", text }] };
        }
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
    }
});
function formatImpactReport(report) {
    const { changedAsset, affectedFiles, summary, warnings } = report;
    const lines = [
        `## Impact Report`,
        `**Asset**: ${changedAsset.column ? `${changedAsset.table}.${changedAsset.column}` : changedAsset.table}`,
        `**Change**: ${changedAsset.changeType}${changedAsset.newName ? ` → ${changedAsset.newName}` : ""}`,
        ``,
        `**Summary**: ${summary}`,
    ];
    if (warnings.length > 0) {
        lines.push("", "### Warnings");
        for (const warning of warnings)
            lines.push(`- ${warning}`);
    }
    if (affectedFiles.length > 0) {
        lines.push(``, `### Affected Files`);
        for (const f of affectedFiles) {
            lines.push(``, `**${f.filePath}:${f.line}** [confidence: ${f.confidence}]`);
            if (f.provenance) {
                lines.push(`source: ${f.provenance}`);
                lines.push(`evidence: ${capitalizeEvidence(f.evidenceType)}`);
            }
            if (f.snippet)
                lines.push("```", f.snippet, "```");
            if (f.suggestedFix)
                lines.push(`> Fix: ${f.suggestedFix}`);
        }
    }
    return lines.join("\n");
}
function formatLineageResult(result) {
    const { asset, consumers, upstream, tree, warnings } = result;
    const lines = [
        `## Lineage: ${asset.column ? `${asset.table}.${asset.column}` : asset.table}`,
        ``,
        "```",
        tree,
        "```",
    ];
    if (warnings.length > 0) {
        lines.push(``, `### Warnings`);
        for (const warning of warnings) {
            lines.push(`- ${warning}`);
        }
    }
    if (upstream.length > 0) {
        lines.push(``, `### Upstream Tables`);
        for (const t of upstream) {
            lines.push(`- **${t.name}** (${t.filePath}:${t.line})`);
        }
    }
    if (consumers.length > 0) {
        lines.push(``, `### Consumers (${consumers.length})`);
        for (const c of consumers) {
            lines.push(`- \`${c.filePath}:${c.line}\` — ${c.pattern} [${c.confidence}] (${c.provenance}; ${capitalizeEvidence(c.evidenceType)})`);
        }
    }
    return lines.join("\n");
}
function formatWarningsBlock(warnings) {
    if (warnings.length === 0)
        return "";
    return `\nWarnings:\n${warnings.map((warning) => `  - ${warning}`).join("\n")}`;
}
function capitalizeEvidence(value) {
    if (!value)
        return "Unknown";
    return value[0].toUpperCase() + value.slice(1);
}
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}
main().catch((err) => {
    process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
});
//# sourceMappingURL=index.js.map