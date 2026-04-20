import { z } from "zod";
import type { LineageGraph, LineageResult } from "../types.js";
export declare const ListLineageSchema: z.ZodObject<{
    table: z.ZodString;
    column: z.ZodOptional<z.ZodString>;
    rootDir: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    table: string;
    rootDir: string;
    column?: string | undefined;
}, {
    table: string;
    column?: string | undefined;
    rootDir?: string | undefined;
}>;
export type ListLineageInput = z.infer<typeof ListLineageSchema>;
export declare function listLineage(input: ListLineageInput, graph: LineageGraph): LineageResult;
export declare function listAllTables(graph: LineageGraph): string[];
//# sourceMappingURL=list-lineage.d.ts.map