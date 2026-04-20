import * as vscode from 'vscode';

export class DebugLog {
  private readonly entries: string[] = [];

  constructor(
    private readonly output: vscode.OutputChannel,
    private readonly rootDir: string,
    private readonly extensionVersion: string,
  ) {}

  info(message: string): void {
    this.write('INFO', message);
  }

  error(message: string): void {
    this.write('ERROR', message);
  }

  async export(): Promise<vscode.Uri | undefined> {
    const defaultUri = vscode.Uri.file(`${this.rootDir}/lineage-debug-log.txt`);
    const target = await vscode.window.showSaveDialog({
      defaultUri,
      filters: { Text: ['txt', 'log'] },
      saveLabel: 'Export Lineage Debug Log',
    });
    if (!target) return undefined;

    const content = this.render();
    await vscode.workspace.fs.writeFile(target, Buffer.from(content, 'utf-8'));
    return target;
  }

  private write(level: 'INFO' | 'ERROR', message: string): void {
    const line = `[${new Date().toISOString()}] ${level} ${message}`;
    this.entries.push(line);
    this.output.appendLine(line);
  }

  private render(): string {
    return [
      '# Lineage MCP Debug Log',
      '',
      `generatedAt=${new Date().toISOString()}`,
      `rootDir=${this.rootDir}`,
      `extensionVersion=${this.extensionVersion}`,
      '',
      '## Entries',
      ...this.entries,
      '',
    ].join('\n');
  }
}
