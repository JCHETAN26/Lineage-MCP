import type { TableNode, DependencyNode } from "../types.js";
interface AlterTableChange {
    table: string;
    changeType: "rename_column" | "add_column" | "drop_column" | "drop_table";
    column?: string;
    newColumn?: string;
    dataType?: string;
    line: number;
}
export interface SqlScanResult {
    tables: TableNode[];
    alterations: AlterTableChange[];
    dependencies: DependencyNode[];
}
export declare function scanSqlFile(content: string, filePath: string): SqlScanResult;
export {};
//# sourceMappingURL=sql-scanner.d.ts.map