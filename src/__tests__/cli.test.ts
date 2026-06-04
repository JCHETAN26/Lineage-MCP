/**
 * CLI tests. Invokes the compiled `dist/cli.js` as a subprocess to exercise
 * argument parsing, exit codes, and output format end-to-end. This is what
 * command-line users hit first; unit tests of the underlying functions don't
 * catch arg-parsing or exit-code bugs.
 */
import { spawn } from "child_process";
import { join } from "path";

const CLI = join(process.cwd(), "dist", "cli.js");
const FIXTURE = join(process.cwd(), "src", "__tests__", "fixtures", "founding-story");

interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function runCli(args: string[]): Promise<CliResult> {
  return new Promise((resolvePromise) => {
    const proc = spawn("node", [CLI, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk) => (stdout += chunk));
    proc.stderr.on("data", (chunk) => (stderr += chunk));
    proc.on("close", (code) => resolvePromise({ stdout, stderr, exitCode: code ?? -1 }));
  });
}

describe("CLI: help and unknown commands", () => {
  it("`help` prints usage and exits 0", async () => {
    const { stdout, exitCode } = await runCli(["help"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Lineage CLI");
    expect(stdout).toContain("scan");
    expect(stdout).toContain("impact");
  });

  it("no args defaults to help", async () => {
    const { stdout, exitCode } = await runCli([]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Lineage CLI");
  });

  it("--help on any command prints help", async () => {
    const { stdout, exitCode } = await runCli(["scan", "--help"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Lineage CLI");
  });

  it("help text does NOT leak the developer's local paths", async () => {
    const { stdout } = await runCli(["help"]);
    // Anyone reading this output on a fresh install must not see absolute
    // paths from the dev's machine.
    expect(stdout).not.toMatch(/\/Users\/chetan/i);
    expect(stdout).not.toMatch(/\/home\/[^\s]+\/Lineage-MCP/i);
  });

  it("unknown command exits non-zero with an error message", async () => {
    const { stderr, exitCode } = await runCli(["frobnicate"]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/unknown command/i);
  });
});

describe("CLI: scan", () => {
  it("scan against founding-story fixture reports the expected counts", async () => {
    const { stdout, exitCode } = await runCli(["scan", "--root", FIXTURE]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Scan Summary");
    expect(stdout).toMatch(/tables:\s*2/);
    expect(stdout).toMatch(/dependencies:/);
  }, 15_000);
});

describe("CLI: tables", () => {
  it("lists users and orders for the founding-story fixture", async () => {
    const { stdout, exitCode } = await runCli(["tables", "--root", FIXTURE]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("- users");
    expect(stdout).toContain("- orders");
  }, 15_000);
});

describe("CLI: lineage", () => {
  it("returns consumers and upstream sections for `users`", async () => {
    const { stdout, exitCode } = await runCli(["lineage", "users", "--root", FIXTURE]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Lineage: users");
    expect(stdout).toContain("Consumers");
    expect(stdout).toContain("etl_pipeline.py");
    expect(stdout).toContain("feature_engineering.ipynb");
  }, 15_000);

  it("exits non-zero when the table name is missing", async () => {
    const { stderr, exitCode } = await runCli(["lineage", "--root", FIXTURE]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/missing table name/i);
  });
});

describe("CLI: impact", () => {
  it("rename users.email reports the 5 affected files", async () => {
    const { stdout, exitCode } = await runCli([
      "impact",
      "users",
      "--change",
      "rename",
      "--column",
      "email",
      "--new-name",
      "user_email",
      "--root",
      FIXTURE,
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Impact: users.email");
    expect(stdout).toContain("etl_pipeline.py");
    expect(stdout).toContain("ml_training.py");
    expect(stdout).toContain(".ipynb");
    expect(stdout).toContain("user_email");
  }, 15_000);

  it("rename WITHOUT --new-name fails with a helpful error", async () => {
    const { stderr, exitCode } = await runCli([
      "impact",
      "users",
      "--change",
      "rename",
      "--root",
      FIXTURE,
    ]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/--new-name/);
  });

  it("invalid --change value fails fast", async () => {
    const { stderr, exitCode } = await runCli([
      "impact",
      "users",
      "--change",
      "frobnicate",
      "--root",
      FIXTURE,
    ]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/invalid --change/i);
  });

  it("missing table name fails fast", async () => {
    const { stderr, exitCode } = await runCli(["impact", "--change", "rename", "--root", FIXTURE]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/missing table/i);
  });
});

describe("CLI: health", () => {
  it("produces a health report with metrics and a Mermaid diagram", async () => {
    const { stdout, exitCode } = await runCli(["health", "--root", FIXTURE]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Health Report");
    expect(stdout).toContain("Total Tables");
    expect(stdout).toContain("mermaid");
  }, 15_000);
});
