import { z } from "zod";
import { applyPatch, verifyPatch } from "../janitor/patcher.js";

export const ApplyRemediationSchema = z.object({
  filePath: z.string().describe("Path to the file to patch"),
  originalSnippet: z.string().describe("The code snippet to find and replace"),
  replacementSnippet: z.string().describe("The new code snippet to insert"),
  description: z.string().describe("Human-readable description of the fix"),
  dryRun: z.boolean().default(false).describe("Preview the change without applying it"),
  backupDir: z.string().default(".lineage/backups").describe("Directory for backup files"),
});

export type ApplyRemediationInput = z.infer<typeof ApplyRemediationSchema>;

export interface RemediationResult {
  success: boolean;
  filePath: string;
  description: string;
  backupPath?: string;
  message: string;
  verified: boolean;
  dryRun: boolean;
}

/**
 * Apply a remediation patch to fix a detected data break
 */
export async function applyRemediation(
  input: ApplyRemediationInput
): Promise<RemediationResult> {
  const {
    filePath,
    originalSnippet,
    replacementSnippet,
    description,
    dryRun,
    backupDir,
  } = input;

  // Apply the patch
  const patchResult = await applyPatch(
    {
      filePath,
      original: originalSnippet,
      replacement: replacementSnippet,
      dryRun,
    },
    backupDir
  );

  // Verify the patch was applied correctly (unless dry-run)
  let verified = false;
  if (patchResult.success && !dryRun) {
    verified = await verifyPatch(filePath, replacementSnippet);
  } else if (dryRun) {
    // In dry-run, we don't actually verify, but report would succeed
    verified = true;
  }

  return {
    success: patchResult.success,
    filePath,
    description,
    backupPath: patchResult.backupPath,
    message: patchResult.message,
    verified,
    dryRun: dryRun || false,
  };
}
