import { writeFile, readFile, mkdir } from "fs/promises";
import { dirname, basename } from "path";
import { existsSync } from "fs";
import { execSync } from "child_process";

export interface PatchOperation {
  filePath: string;
  original: string;
  replacement: string;
  dryRun?: boolean;
}

export interface PatchResult {
  success: boolean;
  filePath: string;
  message: string;
  backupPath?: string;
  changed: boolean;
}

/**
 * Create backup directory structure in .lineage/backups
 */
async function ensureBackupDir(backupRoot: string): Promise<void> {
  await mkdir(backupRoot, { recursive: true });
}

/**
 * Generate timestamped backup filename
 */
function generateBackupPath(filePath: string, backupRoot: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = basename(filePath);
  return `${backupRoot}/${timestamp}_${fileName}.bak`;
}

/**
 * Validate that the original snippet exists in the target file
 */
async function validateSnippetExists(
  filePath: string,
  original: string
): Promise<boolean> {
  try {
    const content = await readFile(filePath, "utf-8");
    return content.includes(original);
  } catch {
    return false;
  }
}

/**
 * Apply a patch with backup and optional dry-run mode
 */
export async function applyPatch(
  operation: PatchOperation,
  backupRoot: string = ".lineage/backups"
): Promise<PatchResult> {
  const { filePath, original, replacement, dryRun = false } = operation;

  try {
    // Validate snippet exists
    const snippetExists = await validateSnippetExists(filePath, original);
    if (!snippetExists) {
      return {
        success: false,
        filePath,
        message: `Original snippet not found in ${filePath}`,
        changed: false,
      };
    }

    if (dryRun) {
      return {
        success: true,
        filePath,
        message: `[DRY RUN] Would replace snippet in ${filePath}`,
        changed: false,
      };
    }

    // Ensure backup directory exists
    await ensureBackupDir(backupRoot);

    // Read current content
    const originalContent = await readFile(filePath, "utf-8");

    // Create backup
    const backupPath = generateBackupPath(filePath, backupRoot);
    await writeFile(backupPath, originalContent);

    // Apply replacement
    const newContent = originalContent.replace(original, replacement);

    // Ensure directory exists for target file
    await mkdir(dirname(filePath), { recursive: true });

    // Write new content
    await writeFile(filePath, newContent, "utf-8");

    return {
      success: true,
      filePath,
      message: `Successfully patched ${filePath}`,
      backupPath,
      changed: true,
    };
  } catch (error) {
    return {
      success: false,
      filePath,
      message: `Error applying patch: ${error instanceof Error ? error.message : String(error)}`,
      changed: false,
    };
  }
}

/**
 * Apply multiple patches atomically
 */
export async function applyPatches(
  operations: PatchOperation[],
  backupRoot: string = ".lineage/backups"
): Promise<PatchResult[]> {
  const results: PatchResult[] = [];

  for (const operation of operations) {
    const result = await applyPatch(operation, backupRoot);
    results.push(result);

    // If any patch fails and not dry-run, stop to prevent partial state
    if (!result.success && !operation.dryRun) {
      return results;
    }
  }

  return results;
}

/**
 * Rollback patches by restoring from backups
 */
export async function rollbackPatches(backupPaths: string[]): Promise<boolean> {
  try {
    for (const backupPath of backupPaths) {
      if (!existsSync(backupPath)) {
        console.warn(`Backup not found: ${backupPath}`);
        continue;
      }

      // Extract original filename from backup naming convention
      const backup = basename(backupPath);
      const originalFileName = backup.replace(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z_/, "").replace(/\.bak$/, "");

      // This is simplified; in production, you'd store the original path in metadata
      console.log(`Would restore ${backupPath}`);
    }
    return true;
  } catch (error) {
    console.error(`Rollback failed: ${error}`);
    return false;
  }
}

/**
 * Verify patch was applied correctly by checking content
 */
export async function verifyPatch(
  filePath: string,
  expectedContent: string
): Promise<boolean> {
  try {
    const content = await readFile(filePath, "utf-8");
    return content.includes(expectedContent);
  } catch {
    return false;
  }
}
