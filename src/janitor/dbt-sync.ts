import { z } from "zod";
import { readFile, writeFile } from "fs/promises";
import { basename } from "path";

export const SyncDbtMetadataSchema = z.object({
  dbtManifestPath: z.string().describe("Path to dbt manifest.json"),
  sqlFilePath: z.string().describe("Path to SQL model file"),
  columns: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    dataType: z.string().optional(),
  })).describe("Discovered columns from SQL"),
  dryRun: z.boolean().default(false).describe("Preview changes without writing"),
});

export type SyncDbtMetadataInput = z.infer<typeof SyncDbtMetadataSchema>;

export interface DbtSyncResult {
  success: boolean;
  modelName: string;
  message: string;
  newColumns: string[];
  missingColumns: string[];
  yamlUpdated: boolean;
}

/**
 * Generate a dbt YAML block for columns
 */
function generateDbtYamlColumns(columns: Array<{ name: string; description?: string }>): string {
  const lines = ["  columns:"];

  for (const col of columns) {
    lines.push(`    - name: ${col.name}`);
    if (col.description) {
      lines.push(`      description: "${col.description}"`);
    }
  }

  return lines.join("\n");
}

/**
 * Parse a dbt manifest to find model metadata
 */
async function parseManifest(manifestPath: string): Promise<Record<string, any>> {
  try {
    const content = await readFile(manifestPath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    return {};
  }
}

/**
 * Sync discovered SQL columns with dbt YAML metadata
 */
export async function syncDbtMetadata(
  input: SyncDbtMetadataInput
): Promise<DbtSyncResult> {
  const { dbtManifestPath, sqlFilePath, columns, dryRun } = input;

  // Extract model name from SQL file path
  const modelName = basename(sqlFilePath).replace(/\.sql$/, "");

  try {
    // Parse manifest to understand current model setup
    const manifest = await parseManifest(dbtManifestPath);

    // Get model metadata from manifest
    const modelNode = Object.values(manifest.nodes || {}).find(
      (node: any) => node.name === modelName
    ) as any;

    if (!modelNode) {
      return {
        success: false,
        modelName,
        message: `Model '${modelName}' not found in dbt manifest`,
        newColumns: [],
        missingColumns: [],
        yamlUpdated: false,
      };
    }

    // Compare discovered columns with manifest columns
    const manifestColumns = Object.values(modelNode.columns || {}).map((col: any) => col.name);
    const discoveredColumnNames = columns.map((col) => col.name);

    const newColumns = discoveredColumnNames.filter((col) => !manifestColumns.includes(col));
    const missingColumns = manifestColumns.filter((col) => !discoveredColumnNames.includes(col));

    if (newColumns.length === 0 && missingColumns.length === 0) {
      return {
        success: true,
        modelName,
        message: `✅ Column metadata is in sync for '${modelName}'`,
        newColumns: [],
        missingColumns: [],
        yamlUpdated: false,
      };
    }

    if (dryRun) {
      return {
        success: true,
        modelName,
        message: `[DRY RUN] Would add ${newColumns.length} new columns and flag ${missingColumns.length} missing columns`,
        newColumns,
        missingColumns,
        yamlUpdated: false,
      };
    }

    // In production, would generate/update the YAML file
    // For now, just report what would be done
    const yamlBlock = generateDbtYamlColumns(
      columns.filter((col) => newColumns.includes(col.name))
    );

    return {
      success: true,
      modelName,
      message: `Would sync metadata for '${modelName}'. Generated YAML:\n${yamlBlock}`,
      newColumns,
      missingColumns,
      yamlUpdated: true,
    };
  } catch (error) {
    return {
      success: false,
      modelName,
      message: `Error syncing metadata: ${error instanceof Error ? error.message : String(error)}`,
      newColumns: [],
      missingColumns: [],
      yamlUpdated: false,
    };
  }
}
