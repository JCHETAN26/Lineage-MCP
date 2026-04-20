import type { LineageGraph, DependencyNode } from "./types.js";
export declare function createGraph(): LineageGraph;
export declare function mergeGraph(target: LineageGraph, source: LineageGraph): void;
export declare function getTableNames(graph: LineageGraph): string[];
export declare function getDependenciesForTable(graph: LineageGraph, tableName: string): DependencyNode[];
export declare function getDependenciesForColumn(graph: LineageGraph, tableName: string, columnName: string): DependencyNode[];
export declare function buildLineageTree(graph: LineageGraph, tableName: string, columnName?: string): string;
//# sourceMappingURL=graph.d.ts.map