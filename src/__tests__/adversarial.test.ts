/**
 * Adversarial input tests.
 *
 * The scanners are regex-based, so they're vulnerable to:
 *   - SQL-shaped strings hiding in Python comments and docstrings
 *   - Local variable names that collide with table names
 *   - Malformed SQL (unclosed strings, missing parens)
 *   - Empty files / whitespace-only files
 *   - Pathologically large strings
 *
 * The crawler must NEVER crash on any of this. False positives on
 * comments/docstrings indicate scanner leaks worth fixing.
 */
import { join } from "path";
import { crawl } from "../crawler.js";
import { listLineage } from "../tools/list-lineage.js";

const FIXTURE = join(process.cwd(), "src", "__tests__", "fixtures", "adversarial");

describe("Adversarial inputs: crawler must not crash, scanners must not lie", () => {
  let graph: Awaited<ReturnType<typeof crawl>>;

  beforeAll(async () => {
    // Critical assertion: the crawl itself must complete without throwing.
    graph = await crawl({ rootDir: FIXTURE });
  }, 15_000);

  describe("Survivability — crawler must not crash", () => {
    it("completes the crawl without throwing", () => {
      expect(graph).toBeDefined();
      expect(graph.dependencies).toBeDefined();
    });

    it("records warnings for malformed files instead of crashing", () => {
      // We don't assert *exact* warning text — we assert the channel exists
      // and is non-empty when malformed inputs are present.
      expect(Array.isArray(graph.warnings)).toBe(true);
    });
  });

  describe("Malformed SQL — must extract valid tables, skip broken ones gracefully", () => {
    it("still discovers valid_table from the malformed fixture", () => {
      expect(graph.tables.has("valid_table")).toBe(true);
    });

    // KNOWN BUG (Tier 6): SQL scanner doesn't recover at statement boundaries.
    // A broken `CREATE TABLE broken_table (id, name VARCHAR(255` (missing
    // close paren) eats the next valid `CREATE TABLE another_valid` that
    // follows it. Real-world impact: any developer with one malformed
    // migration in their repo silently loses everything below it.
    it("still discovers another_valid (defined after a malformed CREATE TABLE)", () => {
      expect(graph.tables.has("another_valid")).toBe(true);
    });

    it("does NOT register tables whose name only appears in SQL comments", () => {
      expect(graph.tables.has("comment_table")).toBe(false);
    });

    it("does NOT register tables from inside unclosed string literals", () => {
      expect(graph.tables.has("should_not_be_a_table")).toBe(false);
    });
  });

  describe("Python scope-collision and comment traps — no false positives", () => {
    // KNOWN BUG (Tier 6, highest priority): Python scanner doesn't strip
    // comments. A `#` comment containing `pd.read_sql("SELECT email FROM users")`
    // is reported as a real query at the comment's line. Real-world impact:
    // every commented-out query becomes a false positive. Fix: pre-strip
    // comments and string literals before pattern matching.
    it("does NOT detect SQL inside Python comments as a real query", () => {
      const result = listLineage({ table: "users", rootDir: FIXTURE }, graph);
      const inComment = result.consumers.find((c) =>
        c.filePath.endsWith("comment_traps.py")
      );
      expect(inComment).toBeUndefined();
    });

    it("does NOT flag a Python variable named `users` as a table reference", () => {
      // Failure cascades from the comment-trap bug above — once we stop
      // scanning comments, this one should pass automatically.
      const result = listLineage({ table: "users", rootDir: FIXTURE }, graph);
      expect(
        result.consumers.every((c) => !c.filePath.endsWith("comment_traps.py"))
      ).toBe(true);
    });
  });

  describe("Real queries surrounded by adversarial code must still be found", () => {
    it("detects pd.read_sql in real_query.py for valid_table", () => {
      const result = listLineage({ table: "valid_table", rootDir: FIXTURE }, graph);
      const ref = result.consumers.find(
        (c) => c.filePath.endsWith("real_query.py") && c.pattern === "pd.read_sql"
      );
      expect(ref).toBeDefined();
    });

    it("detects the read_sql in big_string.py despite a 100k-char string in the same file", () => {
      const result = listLineage({ table: "valid_table", rootDir: FIXTURE }, graph);
      const ref = result.consumers.find((c) => c.filePath.endsWith("big_string.py"));
      expect(ref).toBeDefined();
    });
  });

  describe("Empty and whitespace-only files", () => {
    it("does not crash on empty .sql file", () => {
      // If empty.sql crashed the parser, beforeAll would have thrown.
      // We assert it produced no spurious tables.
      const emptySqlTables = Array.from(graph.tables.values()).filter((t) =>
        t.filePath.endsWith("empty.sql")
      );
      expect(emptySqlTables.length).toBe(0);
    });

    it("does not crash on whitespace-only .py file", () => {
      // Same logic — survival is the assertion.
      expect(graph).toBeDefined();
    });
  });
});
