import { join } from "path";
import { crawl } from "../crawler.js";
import { checkImpact } from "../tools/check-impact.js";
import { listLineage, listAllTables } from "../tools/list-lineage.js";

const FIXTURES = join(process.cwd(), "test-fixtures");

describe("Integration: crawl test-fixtures/", () => {
  let graph: Awaited<ReturnType<typeof crawl>>;

  beforeAll(async () => {
    graph = await crawl({ rootDir: FIXTURES });
  }, 15_000);

  it("discovers all three tables from schema.sql", () => {
    const tables = listAllTables(graph);
    expect(tables).toContain("users");
    expect(tables).toContain("orders");
    expect(tables).toContain("events");
  });

  it("finds Python references to users table", () => {
    const result = listLineage({ table: "users", rootDir: FIXTURES }, graph);
    const pythonFiles = result.consumers.filter((c) => c.language === "python");
    expect(pythonFiles.length).toBeGreaterThan(0);
    const paths = pythonFiles.map((c) => c.filePath);
    expect(paths.some((p) => p.includes("etl_users.py"))).toBe(true);
  });

  it("finds PySpark references to users and events", () => {
    const usersResult = listLineage({ table: "users", rootDir: FIXTURES }, graph);
    const sparkRef = usersResult.consumers.find(
      (c) => c.filePath.includes("ml_pipeline.py") && c.pattern === "spark.sql"
    );
    expect(sparkRef).toBeDefined();

    const eventsResult = listLineage({ table: "events", rootDir: FIXTURES }, graph);
    const sparkRead = eventsResult.consumers.find(
      (c) => c.filePath.includes("ml_pipeline.py") && c.pattern === "spark.read"
    );
    expect(sparkRead).toBeDefined();
  });

  it("finds TypeScript pg.query references to users", () => {
    const result = listLineage({ table: "users", rootDir: FIXTURES }, graph);
    const tsRef = result.consumers.find(
      (c) => c.language === "typescript" && c.filePath.includes("users-api.ts")
    );
    expect(tsRef).toBeDefined();
  });

  it("finds Prisma references to users in analytics.ts", () => {
    const result = listLineage({ table: "users", rootDir: FIXTURES }, graph);
    const prismaRef = result.consumers.find(
      (c) => c.pattern === "prisma" && c.filePath.includes("analytics.ts")
    );
    expect(prismaRef).toBeDefined();
  });

  it("check_impact: renaming users.email reports affected files", async () => {
    const report = await checkImpact(
      { table: "users", column: "email", changeType: "rename", newName: "user_email", rootDir: FIXTURES },
      graph
    );
    expect(report.affectedFiles.length).toBeGreaterThan(0);
    const paths = report.affectedFiles.map((f) => f.filePath);
    console.log("\n--- check_impact: users.email → user_email ---");
    console.log(report.summary);
    report.affectedFiles.forEach((f) =>
      console.log(`  ${f.filePath}:${f.line} [${f.confidence}] — ${f.suggestedFix}`)
    );
  });

  it("check_impact: dropping orders table reports affected files", async () => {
    const report = await checkImpact(
      { table: "orders", changeType: "delete", rootDir: FIXTURES },
      graph
    );
    expect(report.affectedFiles.length).toBeGreaterThan(0);
    console.log("\n--- check_impact: DROP TABLE orders ---");
    console.log(report.summary);
  });

  it("list_lineage tree contains expected sections", () => {
    const result = listLineage({ table: "orders", rootDir: FIXTURES }, graph);
    expect(result.tree).toContain("orders");
    expect(result.consumers.length).toBeGreaterThan(0);
    console.log("\n--- list_lineage: orders ---");
    console.log(result.tree);
  });
});
