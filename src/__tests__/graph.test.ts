import { createGraph, mergeGraph, getDependenciesForTable, getDependenciesForColumn, buildLineageTree } from "../graph.js";
import type { TableNode, DependencyNode } from "../types.js";

const mockTable: TableNode = {
  type: "table",
  name: "users",
  columns: [{ name: "id" }, { name: "email" }],
  filePath: "schema.sql",
  line: 1,
};

const mockDep: DependencyNode = {
  type: "dependency",
  filePath: "etl.py",
  line: 10,
  pattern: "pd.read_sql",
  provenance: "pandas SQL reader scan",
  evidenceType: "heuristic",
  referencedTable: "users",
  referencedColumn: "email",
  confidence: "high",
  language: "python",
};

describe("Graph", () => {
  it("creates an empty graph", () => {
    const g = createGraph();
    expect(g.tables.size).toBe(0);
    expect(g.dependencies).toHaveLength(0);
  });

  it("merges two graphs without duplicates", () => {
    const g1 = createGraph();
    g1.tables.set("users", mockTable);
    g1.dependencies.push(mockDep);

    const g2 = createGraph();
    g2.dependencies.push(mockDep); // duplicate

    mergeGraph(g1, g2);
    expect(g1.dependencies).toHaveLength(1); // deduplicated
  });

  it("getDependenciesForTable returns matching deps", () => {
    const g = createGraph();
    g.tables.set("users", mockTable);
    g.dependencies.push(mockDep);

    const deps = getDependenciesForTable(g, "users");
    expect(deps).toHaveLength(1);
  });

  it("getDependenciesForColumn returns column-specific deps", () => {
    const g = createGraph();
    g.tables.set("users", mockTable);
    g.dependencies.push(mockDep);

    const deps = getDependenciesForColumn(g, "users", "email");
    expect(deps).toHaveLength(1);

    const noDeps = getDependenciesForColumn(g, "users", "id");
    expect(noDeps).toHaveLength(0);
  });

  it("buildLineageTree returns a string with table name", () => {
    const g = createGraph();
    g.tables.set("users", mockTable);
    g.dependencies.push(mockDep);

    const tree = buildLineageTree(g, "users");
    expect(tree).toContain("users");
    expect(tree).toContain("etl.py");
  });
});
