import path from "path";
import { crawl } from "../crawler.js";

const FIXTURE_ROOT = path.resolve("src/__tests__/fixtures/dbt-manifest");

describe("dbt manifest integration", () => {
  it("loads tables and dependencies from target/manifest.json", async () => {
    const graph = await crawl({ rootDir: FIXTURE_ROOT });

    expect(graph.tables.has("orders")).toBe(true);
    expect(graph.tables.has("stg_orders")).toBe(true);
    expect(graph.tables.has("raw_orders")).toBe(true);

    const ordersDeps = graph.dependencies.filter((d) => d.referencedTable === "stg_orders");
    expect(ordersDeps).toHaveLength(1);
    expect(ordersDeps[0].filePath).toBe(path.resolve(FIXTURE_ROOT, "models/orders.sql"));
    expect(ordersDeps[0].pattern).toBe("manifest:model.jaffle_shop.stg_orders");

    const stagingDeps = graph.dependencies.filter((d) => d.referencedTable === "raw_orders");
    expect(stagingDeps).toHaveLength(1);
    expect(stagingDeps[0].pattern).toBe("manifest:source.jaffle_shop.raw.raw_orders");
  });

  it("keeps manifest-backed model files from being double-scanned", async () => {
    const graph = await crawl({ rootDir: FIXTURE_ROOT });
    const ordersDeps = graph.dependencies.filter((d) => d.referencedTable === "stg_orders");

    expect(ordersDeps).toHaveLength(1);
    expect(ordersDeps[0].line).toBe(1);
  });
});
