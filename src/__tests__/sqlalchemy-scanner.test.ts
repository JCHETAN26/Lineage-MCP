/**
 * SQLAlchemy ORM detection — closes the gap surfaced when scanning the
 * real-world Airflow repo. Airflow's operational tables (DagRun, TaskInstance,
 * etc.) are SQLAlchemy declarative classes, not CREATE TABLE statements, and
 * earlier scanners missed every one of them.
 */
import { join } from "path";
import { crawl } from "../crawler.js";
import { scanSqlAlchemyFile } from "../scanners/sqlalchemy-scanner.js";
import { readFileSync } from "fs";

const FIXTURE_DIR = join(process.cwd(), "src", "__tests__", "fixtures", "sqlalchemy");
const MODELS_PY = join(FIXTURE_DIR, "models.py");

describe("SQLAlchemy declarative-model detection", () => {
  describe("Unit: scanSqlAlchemyFile", () => {
    const content = readFileSync(MODELS_PY, "utf-8");
    const tables = scanSqlAlchemyFile(content, MODELS_PY);
    const byName = new Map(tables.map((t) => [t.name, t]));

    it("finds tables by their __tablename__ value", () => {
      expect(byName.has("task_instance")).toBe(true);
      expect(byName.has("dag_run")).toBe(true);
    });

    it("registers class-name aliases when they differ from __tablename__", () => {
      // SQL refers to "task_instance", Python code does session.query(TaskInstance) —
      // both must resolve to the same asset.
      expect(byName.has("TaskInstance")).toBe(true);
      expect(byName.has("DagRun")).toBe(true);
    });

    it("falls back to lowercase class name when __tablename__ is absent", () => {
      // UserSession(db.Model) has no __tablename__, so its table is `usersession`.
      expect(byName.has("usersession")).toBe(true);
    });

    it("extracts Column(...) field names", () => {
      const ti = byName.get("task_instance")!;
      const colNames = ti.columns.map((c) => c.name);
      expect(colNames).toEqual(
        expect.arrayContaining(["id", "dag_id", "state", "created_at"])
      );
    });

    it("extracts mapped_column(...) field names (SQLAlchemy 2.x style)", () => {
      const dr = byName.get("dag_run")!;
      const colNames = dr.columns.map((c) => c.name);
      expect(colNames).toEqual(expect.arrayContaining(["id", "run_id"]));
    });

    it("does NOT register Pydantic BaseModel subclasses as tables", () => {
      // WebhookPayload is BaseModel (Pydantic), not Base (SQLAlchemy).
      expect(byName.has("webhookpayload")).toBe(false);
      expect(byName.has("WebhookPayload")).toBe(false);
    });

    it("records file/line for each discovered model", () => {
      const ti = byName.get("task_instance")!;
      expect(ti.filePath).toBe(MODELS_PY);
      expect(ti.line).toBeGreaterThan(0);
    });
  });

  describe("Integration: crawl picks up ORM tables alongside SQL/Prisma", () => {
    it("registers SQLAlchemy classes when scanning a directory with Python models", async () => {
      const graph = await crawl({ rootDir: FIXTURE_DIR });
      expect(graph.tables.has("task_instance")).toBe(true);
      expect(graph.tables.has("dag_run")).toBe(true);
      expect(graph.tables.has("TaskInstance")).toBe(true);
    });
  });
});
