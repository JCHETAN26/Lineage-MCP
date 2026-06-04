/**
 * Founding-story regression test.
 *
 * Mirrors the real incident that motivated Lineage-MCP: a SQL column rename
 * (users.email -> users.user_email) silently broke a Jupyter notebook, a
 * PySpark training job, a pandas ETL script, and a TypeScript API.
 *
 * This test asserts the tool catches every reference AND documents the bugs
 * surfaced during fixture development. Failing tests in the "KNOWN BUGS"
 * block are intentional — they become the Tier 6 fix list.
 */
import { join } from "path";
import { crawl } from "../crawler.js";
import { checkImpact } from "../tools/check-impact.js";
import { listLineage, listAllTables } from "../tools/list-lineage.js";
import type { LineageGraph } from "../types.js";

const FIXTURE = join(process.cwd(), "src", "__tests__", "fixtures", "founding-story");

describe("Founding Story: users.email rename across SQL / Python / Jupyter / Spark / TS", () => {
  let graph: LineageGraph;

  beforeAll(async () => {
    graph = await crawl({ rootDir: FIXTURE });
  }, 15_000);

  describe("Discovery", () => {
    it("discovers both tables from schema.sql", () => {
      const tables = listAllTables(graph);
      expect(tables).toContain("users");
      expect(tables).toContain("orders");
    });

    it("registers the users table definition at the correct file/line", () => {
      const def = graph.tables.get("users");
      expect(def).toBeDefined();
      expect(def!.filePath).toContain("schema.sql");
      expect(def!.line).toBe(5);
      const colNames = def!.columns.map((c: { name: string }) => c.name);
      expect(colNames).toEqual(
        expect.arrayContaining(["id", "email", "name", "created_at"])
      );
    });
  });

  describe("Cross-language consumer detection", () => {
    it("finds the pandas pd.read_sql in etl_pipeline.py", () => {
      const result = listLineage({ table: "users", rootDir: FIXTURE }, graph);
      const ref = result.consumers.find(
        (c) => c.filePath.endsWith("etl_pipeline.py") && c.pattern === "pd.read_sql"
      );
      expect(ref).toBeDefined();
      expect(ref!.line).toBe(8);
    });

    it("finds the PySpark spark.sql in ml_training.py", () => {
      const result = listLineage({ table: "users", rootDir: FIXTURE }, graph);
      const ref = result.consumers.find(
        (c) => c.filePath.endsWith("ml_training.py") && c.pattern === "spark.sql"
      );
      expect(ref).toBeDefined();
      expect(ref!.line).toBe(7);
    });

    it("finds the raw SQL string in api/users.ts", () => {
      const result = listLineage({ table: "users", rootDir: FIXTURE }, graph);
      const ref = result.consumers.find(
        (c) => c.filePath.endsWith("users.ts") && c.pattern === "raw_sql"
      );
      expect(ref).toBeDefined();
    });

    it("finds the pg.query call in api/users.ts", () => {
      const result = listLineage({ table: "users", rootDir: FIXTURE }, graph);
      const ref = result.consumers.find(
        (c) => c.filePath.endsWith("users.ts") && c.pattern === "pg.query"
      );
      expect(ref).toBeDefined();
    });

    // THE FOUNDING-STORY ASSERTION: Jupyter notebook MUST be detected.
    // This is the file that "hadn't been opened in days" and silently failed.
    it("finds the pd.read_sql inside feature_engineering.ipynb", () => {
      const result = listLineage({ table: "users", rootDir: FIXTURE }, graph);
      const ref = result.consumers.find(
        (c) => c.filePath.endsWith(".ipynb") && c.pattern === "pd.read_sql"
      );
      expect(ref).toBeDefined();
    });
  });

  describe("Zero-noise filter (no false positives)", () => {
    it("does NOT flag scope_collision.py (local var named `email`, no SQL/SQL clients)", () => {
      const result = listLineage({ table: "users", rootDir: FIXTURE }, graph);
      const falsePositive = result.consumers.find((c) =>
        c.filePath.endsWith("scope_collision.py")
      );
      expect(falsePositive).toBeUndefined();
    });
  });

  describe("Impact analysis (the headline tool)", () => {
    it("reports every cross-language consumer for users.email rename", async () => {
      const report = await checkImpact(
        {
          table: "users",
          column: "email",
          changeType: "rename",
          newName: "user_email",
          rootDir: FIXTURE,
        },
        graph
      );

      expect(report.affectedFiles.length).toBeGreaterThanOrEqual(5);

      const paths = report.affectedFiles.map((f) => f.filePath);
      expect(paths.some((p) => p.endsWith("etl_pipeline.py"))).toBe(true);
      expect(paths.some((p) => p.endsWith("ml_training.py"))).toBe(true);
      expect(paths.some((p) => p.endsWith(".ipynb"))).toBe(true);
      expect(paths.some((p) => p.endsWith("users.ts"))).toBe(true);
    });

    it("attaches a suggested fix to every affected file", async () => {
      const report = await checkImpact(
        {
          table: "users",
          column: "email",
          changeType: "rename",
          newName: "user_email",
          rootDir: FIXTURE,
        },
        graph
      );
      for (const f of report.affectedFiles) {
        expect(f.suggestedFix).toBeDefined();
        expect(f.suggestedFix).toContain("user_email");
      }
    });

    it("does NOT include scope_collision.py in the impact report", async () => {
      const report = await checkImpact(
        {
          table: "users",
          column: "email",
          changeType: "rename",
          newName: "user_email",
          rootDir: FIXTURE,
        },
        graph
      );
      const noisy = report.affectedFiles.find((f) =>
        f.filePath.endsWith("scope_collision.py")
      );
      expect(noisy).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // KNOWN BUGS — failing tests that document gaps surfaced during fixture work.
  // These become the Tier 6 fix list. Skipped here so the suite is green, but
  // each describe block names a specific concrete bug to fix.
  // ---------------------------------------------------------------------------
  describe("KNOWN BUGS (skipped — Tier 6 fix targets)", () => {
    it("notebook line number should point to cell source, not raw JSON metadata", async () => {
      // Currently reports line 5 of the .ipynb (which is `"cell_type": "markdown"`
      // in the raw JSON), not the line of the cell containing pd.read_sql.
      // A user clicking the link in their IDE sees notebook metadata, not code.
      const report = await checkImpact(
        { table: "users", column: "email", changeType: "rename", newName: "user_email", rootDir: FIXTURE },
        graph
      );
      const nb = report.affectedFiles.find((f) => f.filePath.endsWith(".ipynb"));
      expect(nb).toBeDefined();
      // The .ipynb snippet should contain the actual SQL, not "cell_type": "markdown"
      expect(nb!.snippet).toContain("pd.read_sql");
    });

    it("confidence agrees between list_lineage and check_impact for the same finding", async () => {
      // list_lineage reports `high`; check_impact reports `medium`. Same ref.
      const lineage = listLineage({ table: "users", rootDir: FIXTURE }, graph);
      const impact = await checkImpact(
        { table: "users", column: "email", changeType: "rename", newName: "user_email", rootDir: FIXTURE },
        graph
      );
      const lineageRef = lineage.consumers.find((c) => c.filePath.endsWith("etl_pipeline.py"));
      const impactRef = impact.affectedFiles.find((f) => f.filePath.endsWith("etl_pipeline.py"));
      expect(lineageRef!.confidence).toBe(impactRef!.confidence);
    });

    it("listLineage exposes the table definition in the structured result", () => {
      const result = listLineage({ table: "users", rootDir: FIXTURE }, graph);
      expect(result.definition).toBeDefined();
      expect(result.definition!.filePath).toContain("schema.sql");
      expect(result.definition!.line).toBe(5);
    });

    it("Prisma `prisma.user.findMany({ select: { email: true } })` is detected as a users reference", () => {
      // prisma scanner misses this pattern in api/users.ts even though it
      // explicitly selects `email`. A Prisma-only project would get a silent
      // false-negative — the exact failure mode the product is meant to stop.
      const result = listLineage({ table: "users", rootDir: FIXTURE }, graph);
      const prismaRef = result.consumers.find(
        (c) => c.filePath.endsWith("users.ts") && c.pattern === "prisma"
      );
      expect(prismaRef).toBeDefined();
    });
  });
});
