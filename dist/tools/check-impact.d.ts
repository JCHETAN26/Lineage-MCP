import { z } from "zod";
import type { LineageGraph, ImpactReport } from "../types.js";
export declare const CheckImpactSchema: z.ZodObject<{
    table: z.ZodString;
    column: z.ZodOptional<z.ZodString>;
    changeType: z.ZodEnum<["rename", "delete", "type_change", "add"]>;
    newName: z.ZodOptional<z.ZodString>;
    rootDir: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    table: string;
    changeType: "rename" | "delete" | "type_change" | "add";
    rootDir: string;
    column?: string | undefined;
    newName?: string | undefined;
}, {
    table: string;
    changeType: "rename" | "delete" | "type_change" | "add";
    column?: string | undefined;
    newName?: string | undefined;
    rootDir?: string | undefined;
}>;
export type CheckImpactInput = z.infer<typeof CheckImpactSchema>;
export declare function checkImpact(input: CheckImpactInput, graph: LineageGraph): Promise<ImpactReport>;
//# sourceMappingURL=check-impact.d.ts.map