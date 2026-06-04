/**
 * Janitor tool coverage — the four tools that mutate user files or make
 * compliance claims:
 *   - apply_remediation (file mutation + backups + dry-run + rollback)
 *   - audit_pii_compliance (PII detection accuracy + downstream flows)
 *   - sync_dbt_metadata (YAML manipulation against dbt manifests)
 *   - generate_health_report (metrics + Mermaid output + file write)
 *
 * Each `describe` block targets one tool. Tests intentionally exercise both
 * happy paths and the failure modes that surfaced during code review.
 */
import { mkdtemp, readFile, writeFile, mkdir, rm } from "fs/promises";
import { existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { crawl } from "../crawler.js";
import { applyPatch, applyPatches } from "../janitor/patcher.js";
import { auditPIICompliance } from "../janitor/compliance.js";
import { syncDbtMetadata } from "../janitor/dbt-sync.js";
import { generateHealthReport } from "../janitor/report-generator.js";
import type { LineageGraph } from "../types.js";

const FIXTURE = join(process.cwd(), "src", "__tests__", "fixtures", "founding-story");

describe("Janitor: apply_remediation (patcher)", () => {
  let workDir: string;
  let targetFile: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "lineage-patch-"));
    targetFile = join(workDir, "code.py");
    await writeFile(
      targetFile,
      `def load_users():\n    df = pd.read_sql("SELECT email FROM users", engine)\n    return df\n`,
      "utf-8"
    );
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it("applies a single-occurrence patch and creates a backup", async () => {
    const backupDir = join(workDir, ".backups");
    const result = await applyPatch(
      {
        filePath: targetFile,
        original: 'pd.read_sql("SELECT email FROM users", engine)',
        replacement: 'pd.read_sql("SELECT user_email FROM users", engine)',
      },
      backupDir
    );

    expect(result.success).toBe(true);
    expect(result.changed).toBe(true);
    expect(result.backupPath).toBeDefined();
    expect(existsSync(result.backupPath!)).toBe(true);
    const newContent = await readFile(targetFile, "utf-8");
    expect(newContent).toContain("user_email");
    expect(newContent).not.toContain('"SELECT email FROM users"');
  });

  it("returns success=false when the snippet doesn't exist", async () => {
    const result = await applyPatch(
      {
        filePath: targetFile,
        original: "this_snippet_is_not_in_the_file",
        replacement: "something_else",
      },
      join(workDir, ".backups")
    );
    expect(result.success).toBe(false);
    expect(result.changed).toBe(false);
  });

  it("dry-run reports the change without modifying the file", async () => {
    const before = await readFile(targetFile, "utf-8");
    const result = await applyPatch(
      {
        filePath: targetFile,
        original: 'pd.read_sql("SELECT email FROM users", engine)',
        replacement: 'pd.read_sql("SELECT user_email FROM users", engine)',
        dryRun: true,
      },
      join(workDir, ".backups")
    );
    expect(result.success).toBe(true);
    expect(result.changed).toBe(false);
    const after = await readFile(targetFile, "utf-8");
    expect(after).toBe(before);
  });

  it("replaces ALL occurrences when snippet matches multiple times", async () => {
    // The original file has just one occurrence. Add a second.
    await writeFile(
      targetFile,
      `pd.read_sql("SELECT email FROM users", engine)\npd.read_sql("SELECT email FROM users", engine)\n`,
      "utf-8"
    );
    const result = await applyPatch(
      {
        filePath: targetFile,
        original: 'pd.read_sql("SELECT email FROM users", engine)',
        replacement: 'pd.read_sql("SELECT user_email FROM users", engine)',
      },
      join(workDir, ".backups")
    );
    expect(result.success).toBe(true);
    const newContent = await readFile(targetFile, "utf-8");
    // After fix: both occurrences should be replaced.
    expect(newContent.match(/user_email/g)?.length).toBe(2);
    expect(newContent.includes('"SELECT email FROM users"')).toBe(false);
  });

  it("applyPatches stops on first failure (no partial state on bad input)", async () => {
    const otherFile = join(workDir, "other.py");
    await writeFile(otherFile, "x = 1\n", "utf-8");

    const results = await applyPatches(
      [
        {
          filePath: targetFile,
          original: "this_does_not_exist",
          replacement: "should_not_apply",
        },
        {
          filePath: otherFile,
          original: "x = 1",
          replacement: "x = 2",
        },
      ],
      join(workDir, ".backups")
    );

    expect(results.length).toBe(1);
    expect(results[0].success).toBe(false);
    // Second patch must NOT have run — otherFile should be untouched.
    const other = await readFile(otherFile, "utf-8");
    expect(other).toBe("x = 1\n");
  });
});

describe("Janitor: audit_pii_compliance", () => {
  let graph: LineageGraph;

  beforeAll(async () => {
    graph = await crawl({ rootDir: FIXTURE });
  }, 15_000);

  it("actually iterates the graph.tables Map and finds PII columns", async () => {
    // The founding-story schema has users.email — should match the HIGH_RISK
    // email pattern. Pre-fix this returned [] because the code does
    // Object.keys(map) which is always [].
    const report = await auditPIICompliance({ graph });
    expect(report.totalTablesScanned).toBeGreaterThan(0);
    const emailFinding = report.findings.find(
      (f) => f.table === "users" && f.column === "email"
    );
    expect(emailFinding).toBeDefined();
    expect(emailFinding!.riskLevel).toBe("high");
  });

  it("respects the `tables` allowlist when provided", async () => {
    const report = await auditPIICompliance({ graph, tables: ["users"] });
    expect(report.totalTablesScanned).toBe(1);
    // No "orders" findings should appear because orders wasn't audited.
    const ordersFinding = report.findings.find((f) => f.table === "orders");
    expect(ordersFinding).toBeUndefined();
  });

  it("returns an empty-findings report for a graph with no PII columns", async () => {
    const safe: LineageGraph = {
      tables: new Map([
        [
          "metrics",
          {
            type: "table",
            name: "metrics",
            columns: [
              { name: "id", dataType: "INTEGER" },
              { name: "value", dataType: "REAL" },
              { name: "created_at", dataType: "TIMESTAMP" },
            ],
            filePath: "/tmp/x.sql",
            line: 1,
          },
        ],
      ]),
      dependencies: [],
      warnings: [],
    };
    const report = await auditPIICompliance({ graph: safe });
    expect(report.findingsCount).toBe(0);
    expect(report.findings).toEqual([]);
  });
});

describe("Janitor: sync_dbt_metadata", () => {
  let workDir: string;
  let manifestPath: string;
  let sqlPath: string;
  let yamlPath: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "lineage-dbt-"));
    manifestPath = join(workDir, "manifest.json");
    sqlPath = join(workDir, "stg_users.sql");
    yamlPath = join(workDir, "schema.yml");

    await writeFile(
      manifestPath,
      JSON.stringify({
        nodes: {
          "model.demo.stg_users": {
            name: "stg_users",
            columns: {
              id: { name: "id" },
              email: { name: "email" },
            },
            patch_path: yamlPath,
          },
        },
      }),
      "utf-8"
    );
    await writeFile(sqlPath, "SELECT id, email FROM raw.users", "utf-8");
    await writeFile(
      yamlPath,
      `version: 2\nmodels:\n  - name: stg_users\n    columns:\n      - name: id\n      - name: email\n`,
      "utf-8"
    );
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it("reports model-not-found when the SQL file doesn't match any manifest model", async () => {
    const result = await syncDbtMetadata({
      dbtManifestPath: manifestPath,
      sqlFilePath: join(workDir, "unknown_model.sql"),
      columns: [{ name: "x" }],
      dryRun: true,
    });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/not found/i);
  });

  it("reports in-sync when discovered columns match the manifest exactly", async () => {
    const result = await syncDbtMetadata({
      dbtManifestPath: manifestPath,
      sqlFilePath: sqlPath,
      columns: [{ name: "id" }, { name: "email" }],
      dryRun: true,
    });
    expect(result.success).toBe(true);
    expect(result.newColumns).toEqual([]);
    expect(result.missingColumns).toEqual([]);
    expect(result.yamlUpdated).toBe(false);
  });

  it("dry-run with new columns reports what would change but does not write", async () => {
    const yamlBefore = await readFile(yamlPath, "utf-8");
    const result = await syncDbtMetadata({
      dbtManifestPath: manifestPath,
      sqlFilePath: sqlPath,
      columns: [{ name: "id" }, { name: "email" }, { name: "created_at" }],
      dryRun: true,
    });
    expect(result.success).toBe(true);
    expect(result.newColumns).toContain("created_at");
    expect(result.yamlUpdated).toBe(false);
    const yamlAfter = await readFile(yamlPath, "utf-8");
    expect(yamlAfter).toBe(yamlBefore);
  });

  it("non-dry-run with new columns actually WRITES the YAML file", async () => {
    // Pre-fix: this is the bug. yamlUpdated=true is returned but no file is
    // written. Test fails on the readFile check, exposing the false success.
    const result = await syncDbtMetadata({
      dbtManifestPath: manifestPath,
      sqlFilePath: sqlPath,
      columns: [
        { name: "id" },
        { name: "email" },
        { name: "created_at", description: "Row creation timestamp" },
      ],
      dryRun: false,
    });
    expect(result.success).toBe(true);
    expect(result.yamlUpdated).toBe(true);
    const yamlAfter = await readFile(yamlPath, "utf-8");
    expect(yamlAfter).toContain("created_at");
  });
});

describe("Janitor: generate_health_report", () => {
  let workDir: string;
  let graph: LineageGraph;

  beforeAll(async () => {
    graph = await crawl({ rootDir: FIXTURE });
  }, 15_000);

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "lineage-report-"));
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it("computes counts that match the graph", async () => {
    const reportPath = join(workDir, "report.md");
    const report = await generateHealthReport(graph, { outputPath: reportPath });
    expect(report.summary.totalTables).toBe(graph.tables.size);
    expect(report.summary.totalDependencies).toBe(graph.dependencies.length);
  });

  it("writes the markdown report to the requested path", async () => {
    const reportPath = join(workDir, "report.md");
    await generateHealthReport(graph, { outputPath: reportPath });
    expect(existsSync(reportPath)).toBe(true);
    const md = await readFile(reportPath, "utf-8");
    expect(md).toContain("# Lineage Health Report");
    expect(md).toContain("Total Tables");
  });

  it("does NOT write a file when outputPath is undefined", async () => {
    // Pre-fix: a relative default path causes a file to be written into
    // <cwd>/.lineage/lineage_health_report.md even when caller wants in-memory.
    await mkdir(join(workDir, ".lineage"), { recursive: true });
    const cwd = process.cwd();
    try {
      process.chdir(workDir);
      await generateHealthReport(graph, { outputPath: undefined as unknown as string });
      expect(existsSync(join(workDir, ".lineage", "lineage_health_report.md"))).toBe(false);
    } finally {
      process.chdir(cwd);
    }
  });

  it("Mermaid diagram contains real table names, not the literal `T` or `D`", async () => {
    // Pre-fix: every node was labeled with the JS variable names T and D.
    // Real diagrams must reference actual asset names.
    const report = await generateHealthReport(graph, { includeDiagram: true, outputPath: join(workDir, "x.md") });
    expect(report.mermaidDiagram).toBeDefined();
    const diagram = report.mermaidDiagram!;
    expect(diagram).toContain("users");
    // Anti-assertion: every node label should not be the bare letter T or D.
    const tNodeOnly = /\bT\[/.test(diagram) && !diagram.includes('T["users"]');
    expect(tNodeOnly).toBe(false);
  });

  it("does NOT give a 100/100 health score to an empty graph", async () => {
    // Pre-fix: score(empty) = 100 because nothing deducts. Empty repos
    // shouldn't be reported as healthy; that masks misconfiguration.
    const empty: LineageGraph = {
      tables: new Map(),
      dependencies: [],
      warnings: [],
    };
    const report = await generateHealthReport(empty, { outputPath: join(workDir, "y.md") });
    expect(report.summary.healthScore).toBeLessThan(100);
  });
});
