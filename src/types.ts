export interface TableNode {
  type: "table";
  name: string;
  columns: ColumnDef[];
  filePath: string;
  line: number;
}

export interface ColumnDef {
  name: string;
  dataType?: string;
}

export interface DependencyNode {
  type: "dependency";
  filePath: string;
  line: number;
  column?: number;
  pattern: string;
  provenance: string;
  evidenceType: "verified" | "heuristic";
  referencedTable: string;
  referencedColumn?: string;
  confidence: "high" | "medium" | "low";
  language: "sql" | "python" | "typescript" | "javascript";
}

export interface LineageGraph {
  tables: Map<string, TableNode>;
  dependencies: DependencyNode[];
  warnings: string[];
}

export interface ImpactReport {
  changedAsset: {
    table: string;
    column?: string;
    changeType: "rename" | "delete" | "type_change" | "add";
    newName?: string;
  };
  affectedFiles: AffectedFile[];
  summary: string;
  warnings: string[];
}

export interface AffectedFile {
  filePath: string;
  line: number;
  column?: number;
  snippet?: string;
  confidence: "high" | "medium" | "low";
  provenance?: string;
  evidenceType?: "verified" | "heuristic";
  suggestedFix?: string;
}

export interface LineageResult {
  asset: { table: string; column?: string };
  consumers: DependencyNode[];
  upstream: TableNode[];
  tree: string;
  warnings: string[];
}

export interface ScanOptions {
  rootDir: string;
  extensions?: string[];
  ignore?: string[];
}
