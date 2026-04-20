import { mkdtemp, mkdir, rm, writeFile, utimes } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { crawl } from "../crawler.js";
import { checkImpact } from "../tools/check-impact.js";
import { listLineage } from "../tools/list-lineage.js";
import { scanSqlFile } from "../scanners/sql-scanner.js";

const BROKEN_MANIFEST_FIXTURE = path.resolve("src/__tests__/fixtures/broken-dbt-manifest");
const COLUMN_IMPACT_FIXTURE = path.resolve("src/__tests__/fixtures/column-impact");

describe("Phase 1 stress tests", () => {
  it("falls back to SQL/dbt scanning when manifest.json is corrupted", async () => {
    const graph = await crawl({ rootDir: BROKEN_MANIFEST_FIXTURE });

    expect(graph.tables.has("orders")).toBe(true);
    expect(graph.tables.has("stg_orders")).toBe(true);

    const deps = graph.dependencies.filter((d) => d.referencedTable === "stg_orders");
    expect(deps).toHaveLength(1);
    expect(deps[0].pattern).toBe("ref(stg_orders)");
    expect(deps[0].filePath).toBe(path.resolve(BROKEN_MANIFEST_FIXTURE, "models/orders.sql"));
  });

  it("keeps nested CTE scopes isolated under adversarial alias reuse", () => {
    const sql = `
with orders as (
    select * from {{ ref('raw_orders') }}
),
outer_scope as (
    select *
    from (
        select
            t1.id,
            t1.customer_id
        from orders t1
        where exists (
            select 1
            from orders t1
            where t1.customer_id = 42
        )
    ) nested
)
select * from outer_scope
`;

    const result = scanSqlFile(sql, "models/orders_rollup.sql");
    const deps = result.dependencies.map((d) => `${d.pattern}:${d.referencedTable}`);

    expect(deps).toContain("ref(raw_orders):raw_orders");
    expect(deps.some((d) => d.endsWith(":orders"))).toBe(false);
    expect(deps.some((d) => d.endsWith(":outer_scope"))).toBe(false);
    expect(deps.some((d) => d.endsWith(":t1"))).toBe(false);
  });

  it("limits column impact to files that actually mention the changed column", async () => {
    const graph = await crawl({ rootDir: COLUMN_IMPACT_FIXTURE });

    const report = await checkImpact(
      {
        table: "users",
        column: "first_name",
        changeType: "rename",
        newName: "given_name",
        rootDir: COLUMN_IMPACT_FIXTURE,
      },
      graph
    );

    const affectedPaths = report.affectedFiles.map((f) => path.basename(f.filePath)).sort();
    expect(affectedPaths).toEqual(["customer_names.sql"]);

    const lineage = listLineage({ table: "users", rootDir: COLUMN_IMPACT_FIXTURE }, graph);
    expect(lineage.consumers.length).toBe(3);
  });

  it("warns when a dbt manifest is older than SQL models", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "lineage-stale-manifest-"));

    try {
      await mkdir(path.join(tempRoot, "models", "staging"), { recursive: true });
      await mkdir(path.join(tempRoot, "target"), { recursive: true });

      const sqlPath = path.join(tempRoot, "models", "staging", "stg_orders.sql");
      const manifestPath = path.join(tempRoot, "target", "manifest.json");

      await writeFile(sqlPath, "select * from {{ source('ecom', 'raw_orders') }}\n", "utf-8");
      await writeFile(
        manifestPath,
        JSON.stringify({
          nodes: {
            "model.jaffle_shop.stg_orders": {
              unique_id: "model.jaffle_shop.stg_orders",
              resource_type: "model",
              name: "stg_orders",
              original_file_path: "models/staging/stg_orders.sql",
              depends_on: { nodes: [] },
            },
          },
        }),
        "utf-8"
      );

      const old = new Date(Date.now() - 60_000);
      const newer = new Date();
      await utimes(manifestPath, old, old);
      await utimes(sqlPath, newer, newer);

      const graph = await crawl({ rootDir: tempRoot });
      expect(
        graph.warnings.some((warning) => warning.includes("dbt manifest is stale"))
      ).toBe(true);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("scales to a generated mini mega-repo without crashing", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "lineage-scale-"));

    try {
      await mkdir(path.join(tempRoot, "consumers"), { recursive: true });
      await writeFile(
        path.join(tempRoot, "schema.sql"),
        `CREATE TABLE users (
  id INT PRIMARY KEY,
  email VARCHAR(255)
);`,
        "utf-8"
      );

      const consumerCount = 250;
      await Promise.all(
        Array.from({ length: consumerCount }, async (_, i) => {
          const filePath = path.join(tempRoot, "consumers", `consumer_${i}.sql`);
          const sql = `SELECT id, email FROM users WHERE id = ${i};`;
          await writeFile(filePath, sql, "utf-8");
        })
      );

      const graph = await crawl({ rootDir: tempRoot });
      const usersConsumers = graph.dependencies.filter((d) => d.referencedTable === "users");

      expect(graph.tables.has("users")).toBe(true);
      expect(usersConsumers).toHaveLength(consumerCount);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
