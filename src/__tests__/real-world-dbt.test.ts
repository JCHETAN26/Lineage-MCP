/**
 * Real-world dbt project regression test.
 *
 * Points the scanner at tmp-jaffle-shop, a real (not curated) dbt project
 * vendored into this repo. Asserts that the scanner discovers the expected
 * models and traces `ref()`-based lineage between them.
 *
 * If any future scanner change regresses dbt support, this test fires.
 */
import { existsSync } from "fs";
import { join } from "path";
import { crawl } from "../crawler.js";
import { listLineage, listAllTables } from "../tools/list-lineage.js";

const JAFFLE_SHOP = join(process.cwd(), "tmp-jaffle-shop");

// Skip the whole suite cleanly if the vendored sample isn't present (e.g.,
// on a fresh checkout or CI without the dbt project pulled in).
const describeIfPresent = existsSync(JAFFLE_SHOP) ? describe : describe.skip;

describeIfPresent("Real-world dbt project (tmp-jaffle-shop)", () => {
  let graph: Awaited<ReturnType<typeof crawl>>;

  beforeAll(async () => {
    graph = await crawl({ rootDir: JAFFLE_SHOP });
  }, 30_000);

  describe("Discovery", () => {
    it("finds the expected dbt models without crashing on real-world SQL", () => {
      const tables = new Set(listAllTables(graph));
      // Marts layer
      expect(tables.has("customers")).toBe(true);
      expect(tables.has("orders")).toBe(true);
      expect(tables.has("products")).toBe(true);
      // Staging layer
      expect(tables.has("stg_orders")).toBe(true);
      expect(tables.has("stg_customers")).toBe(true);
      expect(tables.has("stg_products")).toBe(true);
    });

    it("discovers at least 10 distinct models", () => {
      expect(listAllTables(graph).length).toBeGreaterThanOrEqual(10);
    });
  });

  describe("dbt ref() lineage", () => {
    it("traces stg_orders to its downstream mart consumers via ref()", () => {
      const result = listLineage({ table: "stg_orders", rootDir: JAFFLE_SHOP }, graph);
      const refConsumers = result.consumers.filter((c) => c.pattern.startsWith("ref("));
      // stg_orders is referenced by at least one mart model (orders.sql, order_items.sql)
      expect(refConsumers.length).toBeGreaterThanOrEqual(1);
      // All ref() detections should be marked as verified (came from the dbt
      // manifest scan, not heuristic).
      for (const ref of refConsumers) {
        expect(ref.evidenceType).toBe("verified");
        expect(ref.confidence).toBe("high");
      }
    });

    it("includes the stg_orders table definition in the structured result", () => {
      const result = listLineage({ table: "stg_orders", rootDir: JAFFLE_SHOP }, graph);
      expect(result.definition).toBeDefined();
      expect(result.definition!.filePath).toContain("stg_orders.sql");
    });
  });

  describe("Performance", () => {
    it("completes the full crawl in under 3 seconds", async () => {
      const start = Date.now();
      await crawl({ rootDir: JAFFLE_SHOP });
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(3000);
    }, 5_000);
  });

  describe("Graceful behavior on real-world quirks", () => {
    it("does not crash on Jinja-templated SQL ({{ ref(...) }}, {{ source(...) }})", () => {
      // tmp-jaffle-shop is full of Jinja. If the SQL scanner crashed on
      // unbalanced braces or template tags, `crawl` would have thrown.
      expect(graph).toBeDefined();
      expect(graph.dependencies.length).toBeGreaterThan(0);
    });

    it("does not emit warnings about unrecoverable parse errors", () => {
      // Warnings are OK (manifest missing, etc.) — but none should signal
      // a crash-style failure.
      const fatalWarnings = graph.warnings.filter((w) =>
        /crash|fatal|exception|unhandled/i.test(w)
      );
      expect(fatalWarnings).toEqual([]);
    });
  });
});
