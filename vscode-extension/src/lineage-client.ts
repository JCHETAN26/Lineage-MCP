import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';

export interface Consumer {
  filePath: string;
  line: number;
  pattern: string;
  confidence: string;
  provenance?: string;
}

export interface LineageResult {
  asset: { table: string; column?: string };
  consumers: Consumer[];
  upstream: Array<{ name: string; filePath: string; line: number }>;
  tree: string;
}

export interface ImpactResult {
  changedAsset: { table: string; column?: string; changeType: string; newName?: string };
  affectedFiles: Array<{
    filePath: string;
    line: number;
    confidence: string;
    provenance?: string;
    snippet?: string;
    suggestedFix?: string;
  }>;
  summary: string;
}

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
}

interface LoggerLike {
  info(message: string): void;
  error(message: string): void;
}

export class LineageClient {
  private proc: ChildProcess | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private buf = '';
  private readonly bridgePath: string;

  constructor(
    private readonly rootDir: string,
    private readonly logger?: LoggerLike,
  ) {
    // The bridge lives two levels up from vscode-extension/dist/
    this.bridgePath = join(__dirname, '..', '..', 'lineage-bridge.mjs');
  }

  private ensureProc(): ChildProcess {
    if (this.proc && !this.proc.killed) return this.proc;

    this.logger?.info(`Starting lineage bridge cwd=${this.rootDir}`);
    this.proc = spawn('node', [this.bridgePath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: this.rootDir,
    });

    this.proc.stdout!.setEncoding('utf-8');
    this.proc.stdout!.on('data', (chunk: string) => {
      this.buf += chunk;
      const lines = this.buf.split('\n');
      this.buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line) as { id: number; result?: unknown; error?: string };
          this.logger?.info(`Bridge response id=${msg.id} error=${msg.error ? 'yes' : 'no'}`);
          const p = this.pending.get(msg.id);
          if (p) {
            this.pending.delete(msg.id);
            clearTimeout(p.timer);
            msg.error ? p.reject(new Error(msg.error)) : p.resolve(msg.result);
          }
        } catch { /* malformed line — ignore */ }
      }
    });

    this.proc.stderr!.on('data', (d: Buffer) => {
      const text = d.toString().trim();
      if (text) this.logger?.error(`Bridge stderr: ${text}`);
      process.stderr.write(`[lineage-bridge] ${d.toString()}`);
    });

    this.proc.on('exit', (code, signal) => {
      this.logger?.info(`Bridge exited code=${code ?? 'null'} signal=${signal ?? 'null'}`);
      this.proc = null;
    });

    return this.proc;
  }

  private call<T>(method: string, params: Record<string, unknown>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const id = this.nextId++;
      this.logger?.info(`Calling bridge method=${method} id=${id}`);
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.logger?.error(`Bridge timeout method=${method} id=${id}`);
        reject(new Error(`lineage timeout: ${method}`));
      }, 30_000);

      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });

      try {
        this.ensureProc().stdin!.write(JSON.stringify({ id, method, params }) + '\n');
      } catch (err) {
        this.pending.delete(id);
        clearTimeout(timer);
        this.logger?.error(`Bridge write failed method=${method} id=${id}: ${(err as Error).message}`);
        reject(err);
      }
    });
  }

  scan(): Promise<{ tables: number; deps: number }> {
    return this.call('scan', { rootDir: this.rootDir });
  }

  listLineage(table: string, column?: string): Promise<LineageResult> {
    return this.call('list_lineage', { table, column, rootDir: this.rootDir });
  }

  checkImpact(
    table: string,
    changeType: string,
    column?: string,
    newName?: string
  ): Promise<ImpactResult> {
    return this.call('check_impact', { table, column, changeType, newName, rootDir: this.rootDir });
  }

  listTables(): Promise<string[]> {
    return this.call('list_tables', { rootDir: this.rootDir });
  }

  dispose(): void {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error('LineageClient disposed'));
    }
    this.pending.clear();
    this.proc?.kill();
    this.proc = null;
  }
}
