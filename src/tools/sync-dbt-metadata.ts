import { z } from "zod";
import { syncDbtMetadata } from "../janitor/dbt-sync.js";

export const SyncDbtMetadataMCPSchema = z.object({
  dbtManifestPath: z.string().describe("Path to dbt manifest.json"),
  sqlFilePath: z.string().describe("Path to SQL model file"),
  columns: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    dataType: z.string().optional(),
  })).describe("Discovered columns from SQL"),
  dryRun: z.boolean().default(false).describe("Preview changes without writing"),
});

export type SyncDbtMetadataMCPInput = z.infer<typeof SyncDbtMetadataMCPSchema>;

/**
 * MCP Tool wrapper for dbt metadata synchronization
 */
export async function syncDbtMetadataTool(input: SyncDbtMetadataMCPInput) {
  return syncDbtMetadata(input);
}
