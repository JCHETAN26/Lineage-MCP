/**
 * Scale tests for the crawler.
 *
 * The CLAUDE.md spec promises "10k+ files in <3s". This suite validates
 * that claim by generating realistic file structures at multiple sizes and
 * asserting on wall-clock budgets.
 *
 * Tests are slow on purpose (each one creates and tears down thousands of
 * files in tmp). Per-test timeouts allow up to 60s for the largest tier so
 * CI doesn't false-fail under load.
 */
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { crawl } from "../crawler.js";

async function generateMegaRepo(
  root: string,
  fileCount: number
): Promise<void> {
  await mkdir(join(root, "models"), { recursive: true });
  await writeFile(
    join(root, "schema.sql"),
    `CREATE TABLE users (id INT PRIMARY KEY, email VARCHAR(255));\n` +
      `CREATE TABLE orders (id INT PRIMARY KEY, user_id INT, amount DECIMAL);\n`,
    "utf-8"
  );

  // Spread the consumer files across 20 subdirs so we exercise tree walking,
  // not just one big flat directory.
  const SUBDIR_COUNT = 20;
  for (let i = 0; i < SUBDIR_COUNT; i++) {
    await mkdir(join(root, "models", `dir_${i}`), { recursive: true });
  }

  const BATCH = 500;
  for (let i = 0; i < fileCount; i += BATCH) {
    await Promise.all(
      Array.from({ length: Math.min(BATCH, fileCount - i) }, async (_, j) => {
        const idx = i + j;
        const dir = idx % SUBDIR_COUNT;
        const lang = idx % 3; // rotate SQL / Python / TS
        const filePath = join(
          root,
          "models",
          `dir_${dir}`,
          `consumer_${idx}.${lang === 0 ? "sql" : lang === 1 ? "py" : "ts"}`
        );
        const body =
          lang === 0
            ? `SELECT id, email FROM users WHERE id = ${idx};`
            : lang === 1
              ? `import pandas as pd\ndf = pd.read_sql("SELECT id, email FROM users WHERE id = ${idx}", engine)`
              : `const sql = \`SELECT id, email FROM users WHERE id = ${idx}\`;`;
        await writeFile(filePath, body, "utf-8");
      })
    );
  }
}

describe("Scale: crawler performance under load", () => {
  describe("10k files (CLAUDE.md spec: <3s)", () => {
    let root: string;

    beforeAll(async () => {
      root = await mkdtemp(join(tmpdir(), "lineage-scale-10k-"));
      await generateMegaRepo(root, 10_000);
    }, 60_000);

    afterAll(async () => {
      await rm(root, { recursive: true, force: true });
    }, 60_000);

    it("crawls 10k files in under 3 seconds", async () => {
      const start = Date.now();
      const graph = await crawl({ rootDir: root });
      const elapsed = Date.now() - start;

      expect(graph.tables.has("users")).toBe(true);
      expect(graph.dependencies.length).toBeGreaterThan(9_000);

      // Spec claim from CLAUDE.md. Allow some slack for noisy CI environments.
      // If this fails locally on a real machine, the spec is wrong.
      // eslint-disable-next-line no-console
      console.log(`  [scale-10k] ${elapsed}ms for ${graph.dependencies.length} deps`);
      expect(elapsed).toBeLessThan(3_000);
    }, 30_000);
  });

  describe("50k files (observational — correctness + memory, not wall-clock)", () => {
    let root: string;

    beforeAll(async () => {
      root = await mkdtemp(join(tmpdir(), "lineage-scale-50k-"));
      await generateMegaRepo(root, 50_000);
    }, 120_000);

    afterAll(async () => {
      await rm(root, { recursive: true, force: true });
    }, 60_000);

    it("crawls 50k files without OOM and finds the expected references", async () => {
      const memBefore = process.memoryUsage().heapUsed;
      const start = Date.now();
      const graph = await crawl({ rootDir: root });
      const elapsed = Date.now() - start;
      const memAfter = process.memoryUsage().heapUsed;

      expect(graph.tables.has("users")).toBe(true);
      expect(graph.dependencies.length).toBeGreaterThan(45_000);

      const memDeltaMb = (memAfter - memBefore) / 1024 / 1024;
      // Wall-clock perf is observational at this scale — Jest worker
      // contention makes parallel-run timing too noisy to gate on (observed
      // 13s solo, up to 36s when run alongside the full suite). The 10k
      // assertion above is the contracted SLO; this test exists to catch
      // regressions in correctness and memory growth, not throughput.
      // eslint-disable-next-line no-console
      console.log(
        `  [scale-50k observational] ${elapsed}ms for ${graph.dependencies.length} deps, +${memDeltaMb.toFixed(0)} MB heap`
      );
      // Hard cap on memory: a runaway leak would blow far past 500 MB.
      expect(memDeltaMb).toBeLessThan(500);
    }, 120_000);
  });
});
