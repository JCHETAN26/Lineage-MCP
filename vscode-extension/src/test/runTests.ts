/**
 * VS Code extension test runner.
 *
 * NOTE FOR macOS:
 *   @vscode/test-electron works correctly on Linux/Windows CI.
 *   On macOS, Electron spawned from the terminal does not load VS Code's app
 *   module, so the test runner exits immediately with no output.
 *
 *   To run visual tests on macOS:
 *     1. Open this folder in VS Code:  code vscode-extension/
 *     2. Press F5  →  Extension Development Host opens
 *     3. In the host, open test-fixtures/sql/schema.sql
 *     4. You will see CodeLens ("N dependent files") above each CREATE TABLE
 *        and inline dim text ("← N files use <table>") on each column.
 *
 *   This file is kept so the same suite CAN run on Linux CI via:
 *     npm test
 */
import { runTests, downloadAndUnzipVSCode } from '@vscode/test-electron';
import * as path from 'path';
import * as os from 'os';

async function main(): Promise<void> {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, '../..');
    const extensionTestsPath = path.resolve(__dirname, './suite/index');
    const fixturesPath = path.resolve(__dirname, '../../../test-fixtures');

    const electronPath = await downloadAndUnzipVSCode('1.100.0');

    // On macOS, launching Electron from CLI requires the app path as the first
    // positional argument (the bundle context is not set automatically).
    const isMac = os.platform() === 'darwin';
    const extraLaunchArgs = isMac
      ? [path.resolve(electronPath, '..', '..', 'Resources', 'app')]
      : [];

    await runTests({
      vscodeExecutablePath: electronPath,
      extensionDevelopmentPath,
      extensionTestsPath,
      extensionTestsEnv: { LINEAGE_FIXTURES: fixturesPath },
      launchArgs: [
        ...extraLaunchArgs,
        '--no-sandbox',           // required on Linux CI
        '--disable-gpu-sandbox',
        '--disable-updates',
      ],
    });
  } catch (err) {
    console.error('Test run failed:', err);
    process.exit(1);
  }
}

main();
