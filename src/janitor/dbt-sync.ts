import { z } from "zod";
import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { basename } from "path";
import yaml from "js-yaml";

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

interface DbtColumnEntry {
  name: string;
  description?: string;
  data_type?: string;
}

interface DbtModelEntry {
  name: string;
  columns?: DbtColumnEntry[];
}

interface DbtSchemaFile {
  version?: number;
  models?: DbtModelEntry[];
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

    // Locate the YAML file that documents this model. dbt's manifest stores
    // it as `patch_path` on the node. Without it we cannot safely modify
    // anything — fail loud rather than silently claiming success.
    const patchPath: string | undefined = modelNode.patch_path;
    if (!patchPath || !existsSync(patchPath)) {
      return {
        success: false,
        modelName,
        message:
          `Cannot sync: dbt patch_path for '${modelName}' is missing or unreadable. ` +
          `Add a schema.yml entry for this model first, then re-run.`,
        newColumns,
        missingColumns,
        yamlUpdated: false,
      };
    }

    const yamlText = await readFile(patchPath, "utf-8");
    const parsed = (yaml.load(yamlText) as DbtSchemaFile | null) ?? { version: 2, models: [] };
    parsed.models = parsed.models ?? [];

    let model = parsed.models.find((m) => m.name === modelName);
    if (!model) {
      model = { name: modelName, columns: [] };
      parsed.models.push(model);
    }
    model.columns = model.columns ?? [];

    const existingNames = new Set(model.columns.map((c) => c.name));
    for (const col of columns) {
      if (existingNames.has(col.name)) continue;
      const entry: DbtColumnEntry = { name: col.name };
      if (col.description) entry.description = col.description;
      model.columns.push(entry);
    }

    const out = yaml.dump(parsed, { indent: 2, lineWidth: 120 });
    await writeFile(patchPath, out, "utf-8");

    return {
      success: true,
      modelName,
      message: `Synced metadata for '${modelName}'. Added ${newColumns.length} column(s) to ${patchPath}.`,
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
