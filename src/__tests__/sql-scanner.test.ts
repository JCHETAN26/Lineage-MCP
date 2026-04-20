import { scanSqlFile } from "../scanners/sql-scanner.js";

const SAMPLE_SQL = `
CREATE TABLE users (
  id INT PRIMARY KEY,
  email VARCHAR(255),
  created_at TIMESTAMP
);

CREATE TABLE orders (
  id INT PRIMARY KEY,
  user_id INT,
  amount DECIMAL(10,2)
);

ALTER TABLE users RENAME COLUMN email TO user_email;
ALTER TABLE orders ADD COLUMN status VARCHAR(50);
ALTER TABLE orders DROP COLUMN amount;
DROP TABLE legacy_table;

SELECT * FROM users WHERE id = 1;
INSERT INTO orders (user_id, amount) SELECT id, 100 FROM users;
`;

const DBT_SQL = `
with source as (
    {# this comment mentions from fake_table #}
    select * from {{ ref('raw_customers') }}
),
orders as (
    select * from {{ source('stripe', 'payments') }}
),
final as (
    select
        source.id,
        orders.amount
    from source
    left join orders on source.id = orders.id
)
select * from final
`;

describe("SQL Scanner", () => {
  const result = scanSqlFile(SAMPLE_SQL, "schema.sql");
  const dbtResult = scanSqlFile(DBT_SQL, "models/stg_customers.sql");

  it("detects CREATE TABLE statements", () => {
    expect(result.tables).toHaveLength(2);
    const names = result.tables.map((t) => t.name);
    expect(names).toContain("users");
    expect(names).toContain("orders");
  });

  it("parses column definitions", () => {
    const users = result.tables.find((t) => t.name === "users");
    expect(users).toBeDefined();
    const colNames = users!.columns.map((c) => c.name);
    expect(colNames).toContain("id");
    expect(colNames).toContain("email");
    expect(colNames).toContain("created_at");
  });

  it("detects ALTER TABLE RENAME COLUMN", () => {
    const rename = result.alterations.find((a) => a.changeType === "rename_column");
    expect(rename).toBeDefined();
    expect(rename!.table).toBe("users");
    expect(rename!.column).toBe("email");
    expect(rename!.newColumn).toBe("user_email");
  });

  it("detects ALTER TABLE ADD COLUMN", () => {
    const add = result.alterations.find((a) => a.changeType === "add_column");
    expect(add).toBeDefined();
    expect(add!.table).toBe("orders");
  });

  it("detects ALTER TABLE DROP COLUMN", () => {
    const drop = result.alterations.find((a) => a.changeType === "drop_column");
    expect(drop).toBeDefined();
  });

  it("detects DROP TABLE", () => {
    const drop = result.alterations.find((a) => a.changeType === "drop_table");
    expect(drop).toBeDefined();
    expect(drop!.table).toBe("legacy_table");
  });

  it("stores file path and line number", () => {
    expect(result.tables[0].filePath).toBe("schema.sql");
    expect(result.tables[0].line).toBeGreaterThan(0);
  });

  it("detects table dependencies from query statements", () => {
    const deps = result.dependencies.map((d) => d.referencedTable);
    expect(deps).toContain("users");
    expect(deps).toContain("orders");
  });

  it("does not treat CREATE TABLE targets as dependencies", () => {
    const createLineDeps = result.dependencies.filter(
      (d) => d.referencedTable === "users" && d.pattern === "INTO users"
    );
    expect(createLineDeps).toHaveLength(0);
  });

  it("does not crash on empty input", () => {
    expect(() => scanSqlFile("", "empty.sql")).not.toThrow();
  });

  it("does not crash on malformed SQL", () => {
    expect(() => scanSqlFile("CREATE TABLE (((broken", "bad.sql")).not.toThrow();
  });

  it("infers dbt model names from file names", () => {
    expect(dbtResult.tables.map((t) => t.name)).toContain("stg_customers");
  });

  it("detects dbt ref and source dependencies", () => {
    const deps = dbtResult.dependencies.map((d) => d.referencedTable);
    expect(deps).toContain("raw_customers");
    expect(deps).toContain("payments");
  });

  it("attaches provenance to SQL findings", () => {
    const refDep = dbtResult.dependencies.find((d) => d.referencedTable === "raw_customers");
    const sourceDep = dbtResult.dependencies.find((d) => d.referencedTable === "payments");
    const sqlDep = result.dependencies.find((d) => d.referencedTable === "users");

    expect(refDep?.provenance).toBe("dbt ref() scan");
    expect(sourceDep?.provenance).toBe("dbt source() scan");
    expect(sqlDep?.provenance).toBe("raw SQL clause scan");
  });

  it("does not treat CTE aliases as external tables", () => {
    const deps = dbtResult.dependencies.map((d) => d.referencedTable);
    expect(deps).not.toContain("source");
    expect(deps).not.toContain("orders");
    expect(deps).not.toContain("final");
  });

  it("ignores table-like names inside comments", () => {
    const deps = dbtResult.dependencies.map((d) => d.referencedTable);
    expect(deps).not.toContain("fake_table");
  });
});
