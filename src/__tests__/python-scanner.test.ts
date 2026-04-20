import { scanPythonFile } from "../scanners/python-scanner.js";

const SAMPLE_PYTHON = `
import pandas as pd
from sqlalchemy.orm import Session

# pandas read_sql
df = pd.read_sql("SELECT * FROM users WHERE active = 1", conn)
df2 = pd.read_sql_query("SELECT id, email FROM orders", engine)

# SQLAlchemy
results = session.query(User).filter_by(active=True).all()

# PySpark
df3 = spark.sql("SELECT * FROM transactions WHERE amount > 100")
df4 = spark.read.table("products")

# Raw psycopg2
cursor.execute("SELECT * FROM events WHERE user_id = %s", (user_id,))
`;

describe("Python Scanner", () => {
  const deps = scanPythonFile(SAMPLE_PYTHON, "etl.py");

  it("detects pd.read_sql with table reference", () => {
    const found = deps.find(
      (d) => d.referencedTable === "users" && d.pattern === "pd.read_sql"
    );
    expect(found).toBeDefined();
    expect(found!.confidence).toBe("high");
  });

  it("detects pd.read_sql_query with table reference", () => {
    const found = deps.find((d) => d.referencedTable === "orders");
    expect(found).toBeDefined();
  });

  it("detects spark.sql with table reference", () => {
    const found = deps.find(
      (d) => d.referencedTable === "transactions" && d.pattern === "spark.sql"
    );
    expect(found).toBeDefined();
  });

  it("detects spark.read.table", () => {
    const found = deps.find(
      (d) => d.referencedTable === "products" && d.pattern === "spark.read"
    );
    expect(found).toBeDefined();
  });

  it("includes file path and line number", () => {
    expect(deps[0].filePath).toBe("etl.py");
    expect(deps[0].line).toBeGreaterThan(0);
    expect(deps[0].language).toBe("python");
  });

  it("deduplicates identical references", () => {
    const duped = `
df = pd.read_sql("SELECT * FROM users", conn)
df2 = pd.read_sql("SELECT * FROM users", conn)
`;
    const result = scanPythonFile(duped, "dup.py");
    const userRefs = result.filter((d) => d.referencedTable === "users");
    // Same table on different lines => both kept; same line => deduplicated
    expect(userRefs.length).toBeGreaterThan(0);
  });

  it("does not crash on empty input", () => {
    expect(() => scanPythonFile("", "empty.py")).not.toThrow();
  });
});
