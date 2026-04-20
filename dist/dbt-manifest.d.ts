import type { LineageGraph } from "./types.js";
export interface DbtManifestResult {
    graph: LineageGraph;
    manifestPath: string | null;
    managedFiles: Set<string>;
    warnings: string[];
}
export declare function loadDbtManifest(rootDir: string): Promise<DbtManifestResult>;
//# sourceMappingURL=dbt-manifest.d.ts.map